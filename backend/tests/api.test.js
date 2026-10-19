
import test, { before, after } from "node:test";
import assert from "node:assert/strict";

let server;
let baseUrl;

before(async () => {
  // Aislamiento: nunca utilizar la base de desarrollo.
  // Estas primeras pruebas no necesitan abrir conexiones SQL.
  process.env.DB_HOST = "127.0.0.1";
  process.env.DB_PORT = "5434";
  process.env.DB_NAME = "admincond_test";
  process.env.DB_USER = "postgres";
  process.env.DB_PASSWORD = "NO_DATABASE_ACCESS";

  const { default: app } = await import(
    "../src/http-app.js"
  );

  server = await new Promise((resolve, reject) => {
    const instance = app.listen(
      0,
      "127.0.0.1",
      () => resolve(instance)
    );

    instance.once("error", reject);
  });

  const address = server.address();

  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});

test("D20-09: API responde correctamente", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
});

test("D20-10: /auth/me rechaza acceso sin JWT", async () => {
  const response = await fetch(`${baseUrl}/api/auth/me`);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.message, "Token requerido");
});

test("D20-11: áreas requieren autenticación", async () => {
  const response = await fetch(
    `${baseUrl}/api/reservations/areas?condominioId=1`
  );

  assert.equal(response.status, 401);
});

test("D20-12: crear área sin JWT está prohibido", async () => {
  const response = await fetch(
    `${baseUrl}/api/reservations/areas`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        condominioId: 1,
        nombre: "Área no autorizada",
      }),
    }
  );

  assert.equal(response.status, 401);
});

test("D20-13: crear reserva sin JWT está prohibido", async () => {
  const response = await fetch(
    `${baseUrl}/api/reservations`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        areaId: 1,
        unidadId: 1,
        inicio: "2099-10-30T14:00:00Z",
        fin: "2099-10-30T16:00:00Z",
      }),
    }
  );

  assert.equal(response.status, 401);
});

test("D20-14: cancelar sin JWT está prohibido", async () => {
  const response = await fetch(
    `${baseUrl}/api/reservations/1/cancel`,
    {
      method: "PATCH",
    }
  );

  assert.equal(response.status, 401);
});

test("D20-15: JSON incorrecto devuelve 400", async () => {
  const response = await fetch(
    `${baseUrl}/api/reservations`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: "{json-invalido",
    }
  );

  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.message, "El JSON enviado no es válido");
});

test("D20-16: ruta inexistente devuelve 404", async () => {
  const response = await fetch(
    `${baseUrl}/api/no-existe`
  );

  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.message, "Ruta no encontrada");
});


test("D20-17: rechaza un token malformado", async () => {
  const response = await fetch(`${baseUrl}/api/auth/me`, {
    headers: {
      Authorization: "Bearer esto-no-es-un-jwt",
    },
  });

  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.message, "Token inválido o expirado");
});

test("D20-18: rechaza un esquema de autenticación incorrecto", async () => {
  const response = await fetch(`${baseUrl}/api/auth/me`, {
    headers: {
      Authorization: "Basic credenciales-falsas",
    },
  });

  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.message, "Token requerido");
});
