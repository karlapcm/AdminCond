
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

const root = fileURLToPath(new URL("../../", import.meta.url));
const envPath = fileURLToPath(new URL("../.env.test", import.meta.url));
const env = dotenv.parse(readFileSync(envPath));

if (
  env.DB_NAME !== "admincond_test" ||
  env.DB_USER !== "admincond_test_api" ||
  !env.JWT_SECRET ||
  env.JWT_SECRET.length < 32
) {
  throw new Error("Configuración TEST inválida");
}

const docker = process.platform === "win32" ? "docker.exe" : "docker";
const url = "http://127.0.0.1:3001";
const marker = randomUUID();

const emails = {
  admin: `admin-${marker}@admincond.test`,
  resident: `resident-${marker}@admincond.test`,
  owner: `owner-${marker}@admincond.test`,
  outsider: `outsider-${marker}@admincond.test`,
};

const sessions = {
  admin: randomUUID(),
  resident: randomUUID(),
  owner: randomUUID(),
  outsider: randomUUID(),
};

let ids;
let tokens;

function sql(query) {
  return execFileSync(
    docker,
    [
      "compose", "-f", "compose.test.yaml",
      "exec", "-T", "postgres-test",
      "psql", "-X", "-A", "-t", "-q",
      "-v", "ON_ERROR_STOP=1",
      "-U", "postgres", "-d", "admincond_test",
      "-c", query,
    ],
    { cwd: root, encoding: "utf8", timeout: 20000 }
  ).trim();
}

function signToken(userId, sessionId) {
  return jwt.sign(
    { sid: sessionId },
    env.JWT_SECRET,
    {
      algorithm: "HS256",
      subject: String(userId),
      issuer: "admincond-api",
      audience: "admincond-app",
      expiresIn: "15m",
    }
  );
}

async function send(path, role, options = {}) {
  return fetch(`${url}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${tokens[role]}`,
      ...(options.body
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
}

before(async () => {
  // Comprobar el entorno antes de insertar fixtures.
  assert.equal(sql("SELECT current_database();"), "admincond_test");

  const health = await fetch(`${url}/api/health/db`);
  assert.equal(health.status, 200);

  // Una sola operación transaccional crea todos los fixtures.
  sql(`
    DO $$
    DECLARE
      client_a BIGINT;
      client_b BIGINT;
      condo_a BIGINT;
      condo_b BIGINT;
      admin_id BIGINT;
      resident_id BIGINT;
      owner_id BIGINT;
      outsider_id BIGINT;
      unit_a BIGINT;
      unit_b BIGINT;
      area_id BIGINT;
    BEGIN
      IF current_database() <> 'admincond_test' THEN
        RAISE EXCEPTION 'Base de datos incorrecta';
      END IF;

      INSERT INTO admincond.usuarios
        (nombre, correo, password_hash)
      VALUES ('Admin TEST', '${emails.admin}', 'NO_LOGIN_TEST')
      RETURNING id INTO admin_id;

      INSERT INTO admincond.usuarios
        (nombre, correo, password_hash)
      VALUES ('Residente TEST', '${emails.resident}', 'NO_LOGIN_TEST')
      RETURNING id INTO resident_id;

      INSERT INTO admincond.usuarios
        (nombre, correo, password_hash)
      VALUES ('Propietario TEST', '${emails.owner}', 'NO_LOGIN_TEST')
      RETURNING id INTO owner_id;

      INSERT INTO admincond.usuarios
        (nombre, correo, password_hash)
      VALUES ('Externo TEST', '${emails.outsider}', 'NO_LOGIN_TEST')
      RETURNING id INTO outsider_id;

      INSERT INTO admincond.clientes (nombre)
      VALUES ('CLIENT-A-${marker}')
      RETURNING id INTO client_a;

      INSERT INTO admincond.clientes (nombre)
      VALUES ('CLIENT-B-${marker}')
      RETURNING id INTO client_b;

      INSERT INTO admincond.condominios (cliente_id, nombre)
      VALUES (client_a, 'CONDO-A-${marker}')
      RETURNING id INTO condo_a;

      INSERT INTO admincond.condominios (cliente_id, nombre)
      VALUES (client_b, 'CONDO-B-${marker}')
      RETURNING id INTO condo_b;

      INSERT INTO admincond.membresias_cliente
        (usuario_id, cliente_id, rol)
      VALUES
        (admin_id, client_a, 'colaborador'),
        (resident_id, client_a, 'colaborador'),
        (owner_id, client_a, 'colaborador'),
        (outsider_id, client_b, 'colaborador');

      INSERT INTO admincond.membresias_condominio
        (usuario_id, cliente_id, condominio_id, rol)
      VALUES
        (admin_id, client_a, condo_a, 'administrador'),
        (resident_id, client_a, condo_a, 'residente'),
        (owner_id, client_a, condo_a, 'residente'),
        (outsider_id, client_b, condo_b, 'residente');

      INSERT INTO admincond.unidades
        (condominio_id, codigo, tipo)
      VALUES (condo_a, 'UNIT-A-${marker}', 'casa')
      RETURNING id INTO unit_a;

      INSERT INTO admincond.unidades
        (condominio_id, codigo, tipo)
      VALUES (condo_a, 'UNIT-B-${marker}', 'casa')
      RETURNING id INTO unit_b;

      INSERT INTO admincond.relaciones_unidad
        (usuario_id, condominio_id, unidad_id, es_ocupante)
      VALUES
        (resident_id, condo_a, unit_a, TRUE),
        (owner_id, condo_a, unit_b, TRUE);

      INSERT INTO admincond.areas_comunes
        (cliente_id, condominio_id, nombre, creada_por)
      VALUES (client_a, condo_a, 'AREA-${marker}', admin_id)
      RETURNING id INTO area_id;

      INSERT INTO admincond.reservas_areas
        (area_id, condominio_id, unidad_id,
         usuario_id, inicio, fin)
      VALUES
        (area_id, condo_a, unit_b, owner_id,
         '2099-10-30T14:00:00Z',
         '2099-10-30T16:00:00Z');

      INSERT INTO admincond.sesiones
        (id, usuario_id, refresh_hash, expira_en)
      VALUES
        ('${sessions.admin}', admin_id,
         '${randomUUID()}', NOW() + INTERVAL '1 hour'),
        ('${sessions.resident}', resident_id,
         '${randomUUID()}', NOW() + INTERVAL '1 hour'),
        ('${sessions.owner}', owner_id,
         '${randomUUID()}', NOW() + INTERVAL '1 hour'),
        ('${sessions.outsider}', outsider_id,
         '${randomUUID()}', NOW() + INTERVAL '1 hour');
    END
    $$;
  `);

  const result = sql(`
    SELECT
      (SELECT id FROM admincond.usuarios
       WHERE correo = '${emails.admin}')
      || '|' ||
      (SELECT id FROM admincond.usuarios
       WHERE correo = '${emails.resident}')
      || '|' ||
      (SELECT id FROM admincond.usuarios
       WHERE correo = '${emails.owner}')
      || '|' ||
      (SELECT id FROM admincond.usuarios
       WHERE correo = '${emails.outsider}')
      || '|' ||
      (SELECT id FROM admincond.condominios
       WHERE nombre = 'CONDO-A-${marker}')
      || '|' ||
      (SELECT id FROM admincond.reservas_areas
       WHERE area_id = (
         SELECT id FROM admincond.areas_comunes
         WHERE nombre = 'AREA-${marker}'
       ));
  `).split("|");

  assert.equal(result.length, 6);
  assert.ok(result.every((id) => /^\d+$/.test(id)));

  ids = {
    admin: result[0],
    resident: result[1],
    owner: result[2],
    outsider: result[3],
    condo: result[4],
    reservation: result[5],
  };

  tokens = {
    admin: signToken(ids.admin, sessions.admin),
    resident: signToken(ids.resident, sessions.resident),
    owner: signToken(ids.owner, sessions.owner),
    outsider: signToken(ids.outsider, sessions.outsider),
  };
});

after(() => {
  // Limpiar solo los datos identificados con nuestro UUID.
  sql(`
    DO $$
    BEGIN
      IF current_database() <> 'admincond_test' THEN
        RAISE EXCEPTION 'Base incorrecta';
      END IF;

      DELETE FROM admincond.reservas_areas
      WHERE area_id IN (
        SELECT id FROM admincond.areas_comunes
        WHERE nombre LIKE '%${marker}'
      );

      DELETE FROM admincond.areas_comunes
      WHERE condominio_id IN (
        SELECT id FROM admincond.condominios
        WHERE nombre LIKE '%${marker}'
      );

      DELETE FROM admincond.relaciones_unidad
      WHERE condominio_id IN (
        SELECT id FROM admincond.condominios
        WHERE nombre LIKE '%${marker}'
      );

      DELETE FROM admincond.unidades
      WHERE condominio_id IN (
        SELECT id FROM admincond.condominios
        WHERE nombre LIKE '%${marker}'
      );

      DELETE FROM admincond.membresias_condominio
      WHERE condominio_id IN (
        SELECT id FROM admincond.condominios
        WHERE nombre LIKE '%${marker}'
      );

      DELETE FROM admincond.membresias_cliente
      WHERE cliente_id IN (
        SELECT id FROM admincond.clientes
        WHERE nombre LIKE '%${marker}'
      );

      DELETE FROM admincond.condominios
      WHERE nombre LIKE '%${marker}';

      DELETE FROM admincond.clientes
      WHERE nombre LIKE '%${marker}';

      DELETE FROM admincond.usuarios
      WHERE correo IN (
        '${emails.admin}',
        '${emails.resident}',
        '${emails.owner}',
        '${emails.outsider}'
      );
    END
    $$;
  `);
});

test("D20-20: residente no puede crear áreas", async () => {
  const response = await send(
    "/api/reservations/areas",
    "resident",
    {
      method: "POST",
      body: JSON.stringify({
        condominioId: Number(ids.condo),
        nombre: `DENIED-${marker}`,
      }),
    }
  );

  assert.equal(response.status, 404);
});

test("D20-21: usuario externo no puede consultar áreas", async () => {
  const response = await send(
    `/api/reservations/areas?condominioId=${ids.condo}`,
    "outsider"
  );

  assert.equal(response.status, 404);
});

test("D20-22: residente no puede cancelar reserva ajena", async () => {
  const response = await send(
    `/api/reservations/${ids.reservation}/cancel`,
    "resident",
    { method: "PATCH" }
  );

  assert.equal(response.status, 404);
});

test("D20-23: administrador sí puede registrar un área", async () => {
  const response = await send(
    "/api/reservations/areas",
    "admin",
    {
      method: "POST",
      body: JSON.stringify({
        condominioId: Number(ids.condo),
        nombre: `NEW-AREA-${marker}`,
        descripcion: "Área creada durante el test",
      }),
    }
  );

  const body = await response.json();

  assert.equal(response.status, 201, JSON.stringify(body));
  assert.equal(body.area.nombre, `NEW-AREA-${marker}`);
});

test("D23-01: administrador consulta su contexto autorizado", async () => {
  const response = await send(
    `/api/condominiums/${ids.condo}/context`,
    "admin"
  );

  const body = await response.json();

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.contexto.rolCliente, "colaborador");
  assert.equal(body.contexto.rolCondominio, "administrador");
  assert.equal(String(body.contexto.condominioId), String(ids.condo));
  assert.deepEqual(body.contexto.unidades, []);
});

test("D23-02: residente consulta solamente sus relaciones", async () => {
  const response = await send(
    `/api/condominiums/${ids.condo}/context`,
    "resident"
  );

  const body = await response.json();

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.contexto.rolCondominio, "residente");
  assert.equal(body.contexto.unidades.length, 1);
  assert.equal(body.contexto.unidades[0].esOcupante, true);
});

test("D23-03: usuario externo no consulta el contexto ajeno", async () => {
  const response = await send(
    `/api/condominiums/${ids.condo}/context`,
    "outsider"
  );

  assert.equal(response.status, 404);
});

test("D26-01: administrador consulta las unidades autorizadas", async () => {
  const response = await send(
    `/api/units/condominium/${ids.condo}`,
    "admin"
  );

  const body = await response.json();

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.unidades.length, 2);
  assert.ok(
    body.unidades.every(
      (unit) => String(unit.condominio_id) === String(ids.condo)
    )
  );
});

test("D26-02: residente no puede consultar personas de unidades", async () => {
  const unitsResponse = await send(
    `/api/units/condominium/${ids.condo}`,
    "admin"
  );

  assert.equal(unitsResponse.status, 200);

  const { unidades } = await unitsResponse.json();
  const unitId = unidades.find(
    (unit) => unit.codigo === `UNIT-B-${marker}`
  )?.id;

  assert.ok(unitId);

  const response = await send(
    `/api/units/${unitId}/people`,
    "resident"
  );

  assert.equal(response.status, 404);
});

test("D26-03: usuario de otro cliente no consulta unidades ajenas", async () => {
  const response = await send(
    `/api/units/condominium/${ids.condo}`,
    "outsider"
  );

  assert.equal(response.status, 404);
});

test("D26-04: administrador consulta personas de una unidad autorizada", async () => {
  const unitsResponse = await send(
    `/api/units/condominium/${ids.condo}`,
    "admin"
  );

  assert.equal(unitsResponse.status, 200);

  const { unidades } = await unitsResponse.json();

  const unitId = unidades.find(
    (unit) => unit.codigo === `UNIT-B-${marker}`
  )?.id;

  assert.ok(unitId);

  const response = await send(
    `/api/units/${unitId}/people`,
    "admin"
  );

  const body = await response.json();

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.personas.length, 1);
  assert.equal(body.personas[0].nombre, "Propietario TEST");
});

test("D26-05: residente consulta solamente sus unidades", async () => {
  const response = await send("/api/units/mine", "resident");

  const body = await response.json();

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.unidades.length, 1);
  assert.equal(body.unidades[0].codigo, `UNIT-A-${marker}`);
  assert.equal(body.unidades[0].es_ocupante, true);
});