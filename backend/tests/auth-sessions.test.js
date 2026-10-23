import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import argon2 from "argon2";
import dotenv from "dotenv";

const root = fileURLToPath(
  new URL("../../", import.meta.url)
);

const envPath = fileURLToPath(
  new URL("../.env.test", import.meta.url)
);

const testEnv = dotenv.parse(readFileSync(envPath));

if (
  testEnv.DB_NAME !== "admincond_test" ||
  testEnv.DB_USER !== "admincond_test_api" ||
  !testEnv.JWT_SECRET ||
  testEnv.JWT_SECRET.length < 32
) {
  throw new Error(
    "Configuración TEST inválida. Revisa .env.test."
  );
}

const docker =
  process.platform === "win32" ? "docker.exe" : "docker";

function sql(query) {
  return execFileSync(
    docker,
    [
      "compose",
      "-f",
      "compose.test.yaml",
      "exec",
      "-T",
      "postgres-test",
      "psql",
      "-X",
      "-A",
      "-t",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "admincond_test",
      "-c",
      query,
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 15000,
    }
  ).trim();
}

test(
  "D20-19: JWT válido pierde acceso al revocar la sesión",
  { timeout: 30000 },
  async () => {
    const marker = randomUUID();
    const email = `jwt-${marker}@admincond.test`;
    const sessionId = randomUUID();

    // Datos sintéticos: nunca se usan usuarios reales.
    let userCreated = false;

    try {
      const userId = sql(`
        WITH guard AS (
          SELECT current_database() AS db
        )
        INSERT INTO admincond.usuarios (
          nombre, correo, password_hash
        )
        SELECT
          'Test JWT',
          '${email}',
          'TEST_NO_LOGIN'
        FROM guard
        WHERE db = 'admincond_test'
        RETURNING id;
      `);

      assert.match(userId, /^\d+$/);
      userCreated = true;

      sql(`
        INSERT INTO admincond.sesiones (
          id,
          usuario_id,
          refresh_hash,
          expira_en
        )
        VALUES (
          '${sessionId}',
          ${userId},
          '${randomUUID()}',
          NOW() + INTERVAL '1 hour'
        );
      `);

      // Mismos parámetros que usa auth.service.js.
      const token = jwt.sign(
        { sid: sessionId },
        testEnv.JWT_SECRET,
        {
          algorithm: "HS256",
          subject: String(userId),
          issuer: "admincond-api",
          audience: "admincond-app",
          expiresIn: "15m",
        }
      );

      const url = "http://127.0.0.1:3001/api/auth/me";

      const activeResponse = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const activeBody = await activeResponse.json();

      assert.equal(
        activeResponse.status,
        200,
        JSON.stringify(activeBody)
      );

      assert.equal(
        String(activeBody.user.id),
        String(userId)
      );

      // Revocación real en PostgreSQL TEST.
      sql(`
        UPDATE admincond.sesiones
        SET revocada_en = NOW()
        WHERE id = '${sessionId}';
      `);

      const revokedResponse = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const revokedBody = await revokedResponse.json();

      assert.equal(revokedResponse.status, 401);

      assert.equal(
        revokedBody.message,
        "Sesión inválida o revocada"
      );
    } finally {
      if (userCreated) {
        // ON DELETE CASCADE elimina también su sesión.
        // Se limita al correo aleatorio de este test.
        sql(`
          DO $$
          BEGIN
            IF current_database() <> 'admincond_test' THEN
              RAISE EXCEPTION 'Base incorrecta';
            END IF;

            DELETE FROM admincond.usuarios
            WHERE correo = '${email}';
          END
          $$;
        `);
      }
    }
  }
);

test(
  "D30-04: cookie HttpOnly permite renovar, rotar y revocar sesión",
  { timeout: 30000 },
  async () => {
    const marker = randomUUID();
    const email = `cookie-${marker}@admincond.test`;
    const password = `D30-${randomUUID()}`;
    const passwordHash = await argon2.hash(password);

    const baseUrl = "http://127.0.0.1:3001";
    const origin = "http://localhost:5173";

    let userCreated = false;

    function getCookie(response) {
      const header = response.headers.get("set-cookie") || "";

      const match = header.match(
        /admincond_refresh=([^;]+)/
      );

      assert.ok(match, "La respuesta debe incluir la cookie");

      return `admincond_refresh=${match[1]}`;
    }

    try {
      // 1. Crear un usuario sintético en la base TEST.
      const userId = sql(`
        INSERT INTO admincond.usuarios (
          nombre,
          correo,
          password_hash
        )
        SELECT
          'Usuario Cookie D30',
          '${email}',
          '${passwordHash}'
        WHERE current_database() = 'admincond_test'
        RETURNING id;
      `);

      assert.match(userId, /^\d+$/);
      userCreated = true;

      // 2. Iniciar sesión.
      const loginResponse = await fetch(
        `${baseUrl}/api/auth/login`,
        {
          method: "POST",
          headers: {
            Origin: origin,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            correo: email,
            password,
          }),
        }
      );

      const loginBody = await loginResponse.json();

      assert.equal(
        loginResponse.status,
        200,
        JSON.stringify(loginBody)
      );

      assert.ok(loginBody.accessToken);
      assert.ok(loginBody.user);

      assert.equal(
        Object.hasOwn(loginBody, "refreshToken"),
        false,
        "El refresh token no debe aparecer en JSON"
      );

      const firstCookie = getCookie(loginResponse);

      const cookieHeader =
        loginResponse.headers.get("set-cookie") || "";

      assert.match(cookieHeader, /httponly/i);
      assert.match(cookieHeader, /samesite=lax/i);
      assert.match(cookieHeader, /path=\/api\/auth/i);

      // 3. Renovar la sesión utilizando la cookie.
      const refreshResponse = await fetch(
        `${baseUrl}/api/auth/refresh`,
        {
          method: "POST",
          headers: {
            Origin: origin,
            Cookie: firstCookie,
          },
        }
      );

      const refreshBody = await refreshResponse.json();

      assert.equal(
        refreshResponse.status,
        200,
        JSON.stringify(refreshBody)
      );

      assert.ok(refreshBody.accessToken);

      assert.equal(
        Object.hasOwn(refreshBody, "refreshToken"),
        false,
        "La renovación no debe exponer el refresh token"
      );

      const secondCookie = getCookie(refreshResponse);

      assert.notEqual(
        secondCookie,
        firstCookie,
        "Cada renovación debe rotar el refresh token"
      );

      // 4. El token anterior ya no puede renovarse.
      const oldTokenResponse = await fetch(
        `${baseUrl}/api/auth/refresh`,
        {
          method: "POST",
          headers: {
            Origin: origin,
            Cookie: firstCookie,
          },
        }
      );

      assert.equal(oldTokenResponse.status, 401);

      // 5. Cerrar sesión con la cookie actual.
      const logoutResponse = await fetch(
        `${baseUrl}/api/auth/logout`,
        {
          method: "POST",
          headers: {
            Origin: origin,
            Cookie: secondCookie,
          },
        }
      );

      assert.equal(logoutResponse.status, 204);

      const clearCookieHeader =
        logoutResponse.headers.get("set-cookie") || "";

      assert.match(
        clearCookieHeader,
        /admincond_refresh=/i
      );

      // 6. La cookie revocada no debe renovar la sesión.
      const revokedResponse = await fetch(
        `${baseUrl}/api/auth/refresh`,
        {
          method: "POST",
          headers: {
            Origin: origin,
            Cookie: secondCookie,
          },
        }
      );

      assert.equal(revokedResponse.status, 401);

      // Un JWT emitido antes del logout también queda invalidado.
      const revokedAccessResponse = await fetch(
        `${baseUrl}/api/auth/me`,
        {
          headers: {
            Authorization: `Bearer ${refreshBody.accessToken}`,
          },
        }
      );

      assert.equal(
        revokedAccessResponse.status,
        401,
        "Un JWT debe perder acceso después del logout"
      );

    } finally {
      if (userCreated) {
        // Limpiar únicamente el usuario sintético de TEST.
        sql(`
          DO $$
          BEGIN
            IF current_database() <> 'admincond_test' THEN
              RAISE EXCEPTION 'Base incorrecta';
            END IF;

            DELETE FROM admincond.usuarios
            WHERE correo = '${email}';
          END
          $$;
        `);
      }
    }
  }
);
