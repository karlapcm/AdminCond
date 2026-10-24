import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash,} from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { Client } from "pg";

import {
  claimInvitationDelivery,
  recordInvitationDelivery,
} from "../src/modules/invitations/invitation.delivery.js";

import {
  reissueFailedInvitation,
} from "../src/modules/invitations/invitation.reissue.js";

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
  approval: `approval-${marker}@admincond.test`,
};

const sessions = {
  admin: randomUUID(),
  resident: randomUUID(),
  owner: randomUUID(),
  outsider: randomUUID(),
  approval: randomUUID(),
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

function createTestInvitation({ expired = false } = {}) {
  const token = randomBytes(32).toString("base64url");

  const tokenHash = createHash("sha256")
    .update(token)
    .digest("hex");

  const createdAt = expired
    ? "NOW() - INTERVAL '72 hours'"
    : "NOW()";

  const expiresAt = expired
    ? "NOW() - INTERVAL '24 hours'"
    : "NOW() + INTERVAL '48 hours'";

  const invitationId = sql(`
    WITH solicitud AS (
      INSERT INTO admincond.solicitudes_residentes (
        unidad_id,
        condominio_id,
        solicitado_por,
        correo_invitado,
        estado,
        revisado_por,
        revisada_en
      )
      SELECT
        u.id,
        u.condominio_id,
        ${ids.resident},
        '${emails.owner}',
        'aprobada',
        ${ids.admin},
        NOW()
      FROM admincond.unidades u
      WHERE u.codigo = 'UNIT-A-${marker}'
        AND u.condominio_id = ${ids.condo}
      RETURNING id
    )
    INSERT INTO admincond.invitaciones (
      solicitud_id,
      token_hash,
      correo_destino,
      creada_en,
      expira_en
    )
    SELECT
      id,
      '${tokenHash}',
      '${emails.owner}',
      ${createdAt},
      ${expiresAt}
    FROM solicitud
    RETURNING id;
  `);

  assert.match(invitationId, /^\d+$/);

  return token;
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

      -- Usuario adicional para D31-02.
      -- No pertenece inicialmente a ninguna unidad.
      INSERT INTO admincond.usuarios
        (nombre, correo, password_hash)
      VALUES (
        'Invitado Aprobación TEST',
        '${emails.approval}',
        'NO_LOGIN_TEST'
      );

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
         '${randomUUID()}', NOW() + INTERVAL '1 hour'),
        ('${sessions.approval}',
         (SELECT id FROM admincond.usuarios
          WHERE correo = '${emails.approval}'),
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
    approval: signToken(
      sql(`
        SELECT id FROM admincond.usuarios
        WHERE correo = '${emails.approval}';
      `),
      sessions.approval
    ),
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

      DELETE FROM admincond.invitaciones
      WHERE solicitud_id IN (
        SELECT s.id
        FROM admincond.solicitudes_residentes s
        JOIN admincond.condominios c
          ON c.id = s.condominio_id
        WHERE c.nombre LIKE '%${marker}'
      );

      DELETE FROM admincond.solicitudes_residentes
      WHERE condominio_id IN (
        SELECT id
        FROM admincond.condominios
        WHERE nombre LIKE '%${marker}'
      );

      DELETE FROM admincond.comprobantes
      WHERE pago_id IN (
        SELECT p.id
        FROM admincond.pagos p
        JOIN admincond.condominios c
          ON c.id = p.condominio_id
        WHERE c.nombre LIKE '%${marker}'
      );

      DELETE FROM admincond.pagos
      WHERE condominio_id IN (
        SELECT id FROM admincond.condominios
        WHERE nombre LIKE '%${marker}'
      );

      DELETE FROM admincond.cuotas
      WHERE condominio_id IN (
        SELECT id FROM admincond.condominios
        WHERE nombre LIKE '%${marker}'
      );

      DELETE FROM admincond.permisos_financieros
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
        '${emails.outsider}',
        '${emails.approval}'
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

test("D27-01: residente no principal no puede solicitar residentes", async () => {
  const unitsResponse = await send(
    `/api/units/condominium/${ids.condo}`,
    "admin"
  );

  assert.equal(unitsResponse.status, 200);

  const { unidades } = await unitsResponse.json();

  const unitId = unidades.find(
    (unit) => unit.codigo === `UNIT-A-${marker}`
  )?.id;

  assert.ok(unitId);

  const response = await send(
    "/api/invitations/request",
    "resident",
    {
      method: "POST",
      body: JSON.stringify({
        unidadId: Number(unitId),
        correo: emails.owner,
      }),
    }
  );

  assert.equal(response.status, 404);
});

test("D27-02: residente no puede consultar solicitudes administrativas", async () => {
  const response = await send(
    "/api/invitations/pending",
    "resident"
  );

  const body = await response.json();

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.deepEqual(body.solicitudes, []);
});

test("D27-03: invitación con token inválido es rechazada", async () => {
  const response = await send(
    "/api/invitations/accept",
    "resident",
    {
      method: "POST",
      body: JSON.stringify({
        token: "token-invalido-de-prueba-123456789",
      }),
    }
  );

  assert.equal(response.status, 400);
});

test("D27-04: usuario externo no puede solicitar residentes en otro cliente", async () => {
  const unitsResponse = await send(
    `/api/units/condominium/${ids.condo}`,
    "admin"
  );

  assert.equal(unitsResponse.status, 200);

  const { unidades } = await unitsResponse.json();

  const unitId = unidades.find(
    (unit) => unit.codigo === `UNIT-A-${marker}`
  )?.id;

  assert.ok(unitId);

  const response = await send(
    "/api/invitations/request",
    "outsider",
    {
      method: "POST",
      body: JSON.stringify({
        unidadId: Number(unitId),
        correo: emails.owner,
      }),
    }
  );

  assert.equal(response.status, 404);
});

test("D27-05: solo el destinatario puede aceptar y no reutilizar el token", async () => {
  const token = createTestInvitation();

  const options = {
    method: "POST",
    body: JSON.stringify({ token }),
  };

  // Una cuenta diferente intenta utilizar la invitación.
  const incorrectUser = await send(
    "/api/invitations/accept",
    "resident",
    options
  );

  assert.equal(incorrectUser.status, 403);

  // El verdadero destinatario acepta la invitación.
  const correctUser = await send(
    "/api/invitations/accept",
    "owner",
    options
  );

  const body = await correctUser.json();

  assert.equal(correctUser.status, 200, JSON.stringify(body));
  assert.equal(body.message, "Invitación aceptada correctamente");

  // El token utilizado ya no debe funcionar.
  const reused = await send(
    "/api/invitations/accept",
    "owner",
    options
  );

  assert.equal(reused.status, 400);
});

test("D27-06: una invitación expirada es rechazada", async () => {
  const token = createTestInvitation({
    expired: true,
  });

  const response = await send(
    "/api/invitations/accept",
    "owner",
    {
      method: "POST",
      body: JSON.stringify({ token }),
    }
  );

  assert.equal(response.status, 400);
});

test("D28-01: administrador sin permiso financiero no crea cuotas", async () => {
  const unitsResponse = await send(
    `/api/units/condominium/${ids.condo}`,
    "admin"
  );

  assert.equal(unitsResponse.status, 200);

  const { unidades } = await unitsResponse.json();

  const unitId = unidades.find(
    (unit) => unit.codigo === `UNIT-A-${marker}`
  )?.id;

  assert.ok(unitId);

  const response = await send(
    "/api/finance/fees",
    "admin",
    {
      method: "POST",
      body: JSON.stringify({
        unidadId: Number(unitId),
        concepto: "Mantenimiento TEST",
        periodo: "2026-10-01",
        monto: "150.00",
        vencimiento: "2026-10-31",
      }),
    }
  );

  assert.equal(response.status, 404);
});

test("D28-02: usuario externo no puede crear cuotas en otro cliente", async () => {
  const unitsResponse = await send(
    `/api/units/condominium/${ids.condo}`,
    "admin"
  );

  assert.equal(unitsResponse.status, 200);

  const { unidades } = await unitsResponse.json();

  const unitId = unidades.find(
    (unit) => unit.codigo === `UNIT-A-${marker}`
  )?.id;

  assert.ok(unitId);

  const response = await send(
    "/api/finance/fees",
    "outsider",
    {
      method: "POST",
      body: JSON.stringify({
        unidadId: Number(unitId),
        concepto: "Cuota ajena TEST",
        periodo: "2026-11-01",
        monto: "120.00",
        vencimiento: "2026-11-30",
      }),
    }
  );

  assert.equal(response.status, 404);
});


test("D28-03: permiso financiero activo permite crear y revocado bloquea", async () => {
  const unitsResponse = await send(
    `/api/units/condominium/${ids.condo}`,
    "admin"
  );

  assert.equal(unitsResponse.status, 200);

  const { unidades } = await unitsResponse.json();

  const unitId = unidades.find(
    (unit) => unit.codigo === `UNIT-A-${marker}`
  )?.id;

  const unitBId = unidades.find(
    (unit) => unit.codigo === `UNIT-B-${marker}`
  )?.id;

  assert.ok(unitId);
  assert.ok(unitBId);

  // 1. Otorgar permiso financiero explícito al administrador.
  sql(`
    INSERT INTO admincond.permisos_financieros (
      usuario_id,
      condominio_id,
      permiso,
      otorgado_por
    )
    VALUES (
      ${ids.admin},
      ${ids.condo},
      'crear_cuotas',
      ${ids.admin}
    );
  `);

  // 2. Con el permiso activo, puede crear una cuota.
  const authorized = await send(
    "/api/finance/fees",
    "admin",
    {
      method: "POST",
      body: JSON.stringify({
        unidadId: Number(unitId),
        concepto: "Mantenimiento autorizado TEST",
        periodo: "2026-12-01",
        monto: "150.00",
        vencimiento: "2026-12-31",
      }),
    }
  );

  const body = await authorized.json();

  assert.equal(authorized.status, 201, JSON.stringify(body));
  assert.equal(body.cuota.concepto, "Mantenimiento autorizado TEST");
  assert.equal(Number(body.cuota.monto), 150);

  // 3. El residente de la Unidad A puede consultar su cuota.
  const residentResponse = await send(
    "/api/finance/fees/mine",
    "resident"
  );

  const residentBody = await residentResponse.json();

  assert.equal(
    residentResponse.status,
    200,
    JSON.stringify(residentBody)
  );

  assert.ok(
    residentBody.cuotas.some(
      (cuota) => String(cuota.id) === String(body.cuota.id)
    ),
    "El residente debe visualizar la cuota de su unidad"
  );

  // 4. Crear una cuota diferente para la Unidad B.
  const otherFeeResponse = await send(
    "/api/finance/fees",
    "admin",
    {
      method: "POST",
      body: JSON.stringify({
        unidadId: Number(unitBId),
        concepto: "Cuota Unidad B TEST",
        periodo: "2026-12-01",
        monto: "100.00",
        vencimiento: "2026-12-31",
      }),
    }
  );

  const otherFeeBody = await otherFeeResponse.json();

  assert.equal(
    otherFeeResponse.status,
    201,
    JSON.stringify(otherFeeBody)
  );

  // 5. El residente de la Unidad A NO debe ver la cuota de B.
  const isolatedResponse = await send(
    "/api/finance/fees/mine",
    "resident"
  );

  const isolatedBody = await isolatedResponse.json();

  assert.equal(
    isolatedResponse.status,
    200,
    JSON.stringify(isolatedBody)
  );

  assert.ok(
    isolatedBody.cuotas.some(
      (cuota) => String(cuota.id) === String(body.cuota.id)
    ),
    "El residente debe seguir viendo su propia cuota"
  );

  assert.ok(
    isolatedBody.cuotas.every(
      (cuota) =>
        String(cuota.id) !== String(otherFeeBody.cuota.id)
    ),
    "El residente no debe ver cuotas de la Unidad B"
  );

  // 6. Revocar el permiso financiero del administrador.
  sql(`
    UPDATE admincond.permisos_financieros
    SET estado = 'revocado',
        revocado_por = ${ids.admin},
        revocado_en = NOW()
    WHERE usuario_id = ${ids.admin}
      AND condominio_id = ${ids.condo}
      AND permiso = 'crear_cuotas';
  `);

  // 7. Con el permiso revocado, ya no puede crear cuotas.
  const revoked = await send(
    "/api/finance/fees",
    "admin",
    {
      method: "POST",
      body: JSON.stringify({
        unidadId: Number(unitId),
        concepto: "Cuota después de revocación TEST",
        periodo: "2027-01-01",
        monto: "150.00",
        vencimiento: "2027-01-31",
      }),
    }
  );

  assert.equal(revoked.status, 404);
});


test("D29-01: residente reporta su pago y usuario externo es rechazado", async () => {
  // Crear una cuota temporal para la Unidad A.
  const cuotaId = sql(`
    INSERT INTO admincond.cuotas (
      condominio_id,
      unidad_id,
      concepto,
      periodo,
      monto,
      vencimiento,
      creada_por
    )
    SELECT
      u.condominio_id,
      u.id,
      'Pago manual D29-${marker}',
      '2027-02-01',
      200.00,
      '2027-02-28',
      ${ids.admin}
    FROM admincond.unidades u
    WHERE u.codigo = 'UNIT-A-${marker}'
      AND u.condominio_id = ${ids.condo}
    RETURNING id;
  `);

  assert.match(cuotaId, /^\d+$/);

  // Un residente vinculado a la Unidad A reporta S/ 100.
  const authorized = await send(
    "/api/finance/payments",
    "resident",
    {
      method: "POST",
      body: JSON.stringify({
        cuotaId: Number(cuotaId),
        monto: "100.00",
        referencia: "TRANSFERENCIA-D29-TEST",
      }),
    }
  );

  const body = await authorized.json();

  assert.equal(authorized.status, 201, JSON.stringify(body));
  assert.equal(String(body.pago.cuota_id), cuotaId);
  assert.equal(Number(body.pago.monto), 100);
  assert.equal(body.pago.estado, "pendiente");

  // Un usuario del Cliente B intenta pagar esa misma cuota.
  const unauthorized = await send(
    "/api/finance/payments",
    "outsider",
    {
      method: "POST",
      body: JSON.stringify({
        cuotaId: Number(cuotaId),
        monto: "50.00",
        referencia: "PAGO-AJENO-D29",
      }),
    }
  );

  assert.equal(unauthorized.status, 404);
});


test("D29-02: revisar pagos exige permiso financiero y actualiza saldo", async () => {
  // Crear una cuota temporal de S/ 200 para la Unidad A.
  const cuotaId = sql(`
    INSERT INTO admincond.cuotas (
      condominio_id,
      unidad_id,
      concepto,
      periodo,
      monto,
      vencimiento,
      creada_por
    )
    SELECT
      u.condominio_id,
      u.id,
      'Revision de pago D29-${marker}',
      '2027-03-01',
      200.00,
      '2027-03-31',
      ${ids.admin}
    FROM admincond.unidades u
    WHERE u.codigo = 'UNIT-A-${marker}'
      AND u.condominio_id = ${ids.condo}
    RETURNING id;
  `);

  assert.match(cuotaId, /^\d+$/);

  // El residente reporta un pago parcial de S/ 50.
  const paymentResponse = await send(
    "/api/finance/payments",
    "resident",
    {
      method: "POST",
      body: JSON.stringify({
        cuotaId: Number(cuotaId),
        monto: "50.00",
        referencia: "PAGO-REVISION-D29",
      }),
    }
  );

  const paymentBody = await paymentResponse.json();

  assert.equal(
    paymentResponse.status,
    201,
    JSON.stringify(paymentBody)
  );

  const pagoId = paymentBody.pago.id;

  assert.equal(paymentBody.pago.estado, "pendiente");

  // 1. El administrador no tiene permiso de revisión.
  const denied = await send(
    `/api/finance/payments/${pagoId}/review`,
    "admin",
    {
      method: "POST",
      body: JSON.stringify({
        decision: "aprobar",
      }),
    }
  );

  assert.equal(denied.status, 404);

  // 2. Otorgar permiso financiero explícito.
  sql(`
    INSERT INTO admincond.permisos_financieros (
      usuario_id,
      condominio_id,
      permiso,
      otorgado_por
    )
    VALUES (
      ${ids.admin},
      ${ids.condo},
      'revisar_pagos',
      ${ids.admin}
    );
  `);

  // 3. Ahora el administrador sí puede aprobar el pago.
  const approved = await send(
    `/api/finance/payments/${pagoId}/review`,
    "admin",
    {
      method: "POST",
      body: JSON.stringify({
        decision: "aprobar",
      }),
    }
  );

  const approvedBody = await approved.json();

  assert.equal(
    approved.status,
    200,
    JSON.stringify(approvedBody)
  );

  assert.equal(approvedBody.estado, "aprobado");
  assert.equal(Number(approvedBody.saldo), 150);

  // 4. Comprobar el estado persistido en PostgreSQL.
  const cuotaEstado = sql(`
    SELECT estado
    FROM admincond.cuotas
    WHERE id = ${cuotaId};
  `);

  assert.equal(cuotaEstado, "parcial");

  const pagoEstado = sql(`
    SELECT estado
    FROM admincond.pagos
    WHERE id = ${pagoId};
  `);

  assert.equal(pagoEstado, "aprobado");

  // 5. El mismo pago no puede aprobarse dos veces.
  const repeated = await send(
    `/api/finance/payments/${pagoId}/review`,
    "admin",
    {
      method: "POST",
      body: JSON.stringify({
        decision: "aprobar",
      }),
    }
  );

  assert.equal(repeated.status, 409);
});


test("D29-03: usuario externo no puede descargar comprobantes ajenos", async () => {
  // Crear una cuota para la Unidad A.
  const cuotaId = sql(`
    INSERT INTO admincond.cuotas (
      condominio_id,
      unidad_id,
      concepto,
      periodo,
      monto,
      vencimiento,
      creada_por
    )
    SELECT
      u.condominio_id,
      u.id,
      'Comprobante D29-${marker}',
      '2027-04-01',
      100.00,
      '2027-04-30',
      ${ids.admin}
    FROM admincond.unidades u
    WHERE u.codigo = 'UNIT-A-${marker}'
      AND u.condominio_id = ${ids.condo}
    RETURNING id;
  `);

  assert.match(cuotaId, /^\d+$/);

  // El residente registra un pago manual.
  const paymentResponse = await send(
    "/api/finance/payments",
    "resident",
    {
      method: "POST",
      body: JSON.stringify({
        cuotaId: Number(cuotaId),
        monto: "100.00",
        referencia: "COMPROBANTE-D29-TEST",
      }),
    }
  );

  const paymentBody = await paymentResponse.json();

  assert.equal(
    paymentResponse.status,
    201,
    JSON.stringify(paymentBody)
  );

  const pagoId = paymentBody.pago.id;

  // Crear metadatos temporales para probar la autorización
  // sin almacenar ni descargar un archivo real.
  const comprobanteId = sql(`
    INSERT INTO admincond.comprobantes (
      pago_id,
      almacenamiento_clave,
      nombre_original,
      tipo_mime,
      tamano_bytes,
      subido_por
    )
    VALUES (
      ${pagoId},
      '${randomUUID()}.pdf',
      'comprobante-test.pdf',
      'application/pdf',
      100,
      ${ids.resident}
    )
    RETURNING id;
  `);

  assert.match(comprobanteId, /^\d+$/);

  // Un usuario del Cliente B intenta descargarlo.
  const unauthorized = await send(
    `/api/finance/receipts/${comprobanteId}`,
    "outsider"
  );

  assert.equal(unauthorized.status, 404);
});


test("D29-04: comprobante real permite descarga autorizada y bloquea externos", async () => {
  // 1. Crear una cuota temporal en la Unidad A.
  const cuotaId = sql(`
    INSERT INTO admincond.cuotas (
      condominio_id,
      unidad_id,
      concepto,
      periodo,
      monto,
      vencimiento,
      creada_por
    )
    SELECT
      u.condominio_id,
      u.id,
      'Archivo real D29-${marker}',
      '2027-05-01',
      100.00,
      '2027-05-31',
      ${ids.admin}
    FROM admincond.unidades u
    WHERE u.codigo = 'UNIT-A-${marker}'
      AND u.condominio_id = ${ids.condo}
    RETURNING id;
  `);

  assert.match(cuotaId, /^\d+$/);

  // 2. El residente reporta el pago.
  const paymentResponse = await send(
    "/api/finance/payments",
    "resident",
    {
      method: "POST",
      body: JSON.stringify({
        cuotaId: Number(cuotaId),
        monto: "100.00",
        referencia: "ARCHIVO-REAL-D29",
      }),
    }
  );

  const paymentBody = await paymentResponse.json();

  assert.equal(
    paymentResponse.status,
    201,
    JSON.stringify(paymentBody)
  );

  const pagoId = paymentBody.pago.id;

  // PNG mínimo para pruebas: no contiene datos reales.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ" +
    "AAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==",
    "base64"
  );

  // 3. Preparar el archivo multipart/form-data.
  const form = new FormData();

  form.append(
    "comprobante",
    new Blob([png], { type: "image/png" }),
    "comprobante-d29.png"
  );

  let storageKey;

  try {
    // Usamos fetch directamente porque send() agrega
    // Content-Type: application/json cuando hay body.
    // En FormData, fetch debe generar el boundary.
    const uploadResponse = await fetch(
      `${url}/api/finance/receipts/payments/${pagoId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.resident}`,
        },
        body: form,
      }
    );

    const uploadBody = await uploadResponse.json();

    assert.equal(
      uploadResponse.status,
      201,
      JSON.stringify(uploadBody)
    );

    const comprobanteId = uploadBody.comprobante.id;

    assert.equal(
      uploadBody.comprobante.tipo_mime,
      "image/png"
    );

    // Buscar la clave generada por el backend para
    // limpiar posteriormente el archivo temporal.
    storageKey = sql(`
      SELECT almacenamiento_clave
      FROM admincond.comprobantes
      WHERE id = ${comprobanteId};
    `);

    assert.match(
      storageKey,
      /^[a-f0-9-]{36}\.png$/
    );

    // 4. El residente descarga su comprobante.
    const authorized = await send(
      `/api/finance/receipts/${comprobanteId}`,
      "resident"
    );

    assert.equal(authorized.status, 200);

    assert.match(
      authorized.headers.get("content-type") || "",
      /^image\/png/
    );

    assert.equal(
      authorized.headers.get("cache-control"),
      "no-store"
    );

    const downloaded = Buffer.from(
      await authorized.arrayBuffer()
    );

    assert.deepEqual(
      downloaded,
      png,
      "El archivo descargado debe coincidir con el original"
    );

    // 5. Un usuario de otro cliente no puede descargarlo.
    const outsider = await send(
      `/api/finance/receipts/${comprobanteId}`,
      "outsider"
    );

    assert.equal(outsider.status, 404);
  } finally {
    // Eliminar solamente el archivo que generó esta prueba.
    // La base de datos se limpia en el after() general.
    if (storageKey) {
      execFileSync(
        docker,
        [
          "compose",
          "-f",
          "compose.test.yaml",
          "exec",
          "-T",
          "api-test",
          "rm",
          "-f",
          `/tmp/admincond-test-receipts/${storageKey}`,
        ],
        {
          cwd: root,
          encoding: "utf8",
          timeout: 20000,
        }
      );
    }
  }
});


test("D31-01: responsable principal solicita invitar a un residente", async () => {
  // Convertir al residente de la Unidad A en responsable
  // principal activo dentro de nuestro entorno TEST.
  const updated = sql(`
    UPDATE admincond.relaciones_unidad r
    SET es_principal = TRUE
    FROM admincond.unidades u
    WHERE r.unidad_id = u.id
      AND r.usuario_id = ${ids.resident}
      AND r.condominio_id = ${ids.condo}
      AND u.codigo = 'UNIT-A-${marker}'
      AND u.condominio_id = ${ids.condo}
      AND r.estado = 'activo'
    RETURNING r.id;
  `);

  assert.match(updated, /^\d+$/);

  // Obtener la unidad donde el usuario es responsable principal.
  const unitsResponse = await send(
    "/api/units/mine",
    "resident"
  );

  const unitsBody = await unitsResponse.json();

  assert.equal(
    unitsResponse.status,
    200,
    JSON.stringify(unitsBody)
  );

  const unit = unitsBody.unidades.find(
    (item) => item.codigo === `UNIT-A-${marker}`
  );

  assert.ok(unit);
  assert.equal(unit.es_principal, true);

  // Invitamos a una cuenta activa de prueba que todavía
  // no pertenece a la Unidad A.
  const response = await send(
    "/api/invitations/request",
    "resident",
    {
      method: "POST",
      body: JSON.stringify({
        unidadId: Number(unit.id),
        correo: emails.outsider,
      }),
    }
  );

  const body = await response.json();

  assert.equal(response.status, 201, JSON.stringify(body));

  assert.equal(
    body.solicitud.correo_invitado,
    emails.outsider
  );

  assert.equal(body.solicitud.estado, "pendiente");

  // Verificar que la solicitud se guardó realmente.
  const persistedState = sql(`
    SELECT estado
    FROM admincond.solicitudes_residentes
    WHERE id = ${Number(body.solicitud.id)}
      AND condominio_id = ${ids.condo};
  `);

  assert.equal(persistedState, "pendiente");
});


test("D31-02: administrador aprueba solicitud y genera invitación segura", async () => {
  // Identificamos la unidad A de nuestros fixtures TEST.
  const unitId = sql(`
    SELECT id
    FROM admincond.unidades
    WHERE codigo = 'UNIT-A-${marker}'
      AND condominio_id = ${ids.condo};
  `);

  assert.match(unitId, /^\d+$/);

  // Garantizar el permiso necesario para solicitar.
  sql(`
    UPDATE admincond.relaciones_unidad
    SET es_principal = TRUE
    WHERE usuario_id = ${ids.resident}
      AND unidad_id = ${unitId}
      AND estado = 'activo';
  `);

  // 1. El responsable principal genera la solicitud.
  const requestResponse = await send(
    "/api/invitations/request",
    "resident",
    {
      method: "POST",
      body: JSON.stringify({
        unidadId: Number(unitId),
        correo: emails.approval,
      }),
    }
  );

  const requestBody = await requestResponse.json();

  assert.equal(
    requestResponse.status,
    201,
    JSON.stringify(requestBody)
  );

  const solicitudId = Number(requestBody.solicitud.id);

  // 2. El administrador aprueba la solicitud.
  const reviewResponse = await send(
    `/api/invitations/${solicitudId}/review`,
    "admin",
    {
      method: "POST",
      body: JSON.stringify({
        decision: "aprobar",
      }),
    }
  );

  const reviewBody = await reviewResponse.json();

  assert.equal(
    reviewResponse.status,
    200,
    JSON.stringify(reviewBody)
  );

  assert.equal(reviewBody.estado, "aprobada");

  const token = reviewBody.invitacion?.token;

    assert.ok(
    Number.isSafeInteger(Number(reviewBody.invitacion.id))
  );

  assert.equal(
    reviewBody.invitacion.correoDestino,
    emails.approval
  );

  assert.equal(typeof token, "string");
  assert.ok(token.length >= 32);
  assert.equal(reviewBody.invitacion.expiraEnHoras, 48);

  // 3. Verificar el estado y el hash almacenado.
  const stored = sql(`
    SELECT
      s.estado,
      i.estado,
      i.token_hash,
      i.correo_destino,
      (i.expira_en > NOW()),
      (i.expira_en <= NOW() + INTERVAL '48 hours')
    FROM admincond.solicitudes_residentes s
    JOIN admincond.invitaciones i
      ON i.solicitud_id = s.id
    WHERE s.id = ${solicitudId}
      AND s.condominio_id = ${ids.condo};
  `).split("|");

  assert.equal(stored.length, 6);
  assert.equal(stored[0], "aprobada");
  assert.equal(stored[1], "pendiente");
  assert.equal(stored[3], emails.approval);
  assert.equal(stored[4], "t");
  assert.equal(stored[5], "t");

  const expectedHash = createHash("sha256")
    .update(token)
    .digest("hex");

  assert.equal(stored[2], expectedHash);
  assert.notEqual(stored[2], token);
  // D31: una invitación nueva todavía no se ha enviado.
  const deliveryState = sql(`
    SELECT
      estado_entrega,
      intentos_entrega,
      ultimo_intento_en IS NULL,
      enviado_en IS NULL
    FROM admincond.invitaciones
    WHERE solicitud_id = ${solicitudId};
  `).split("|");

  assert.deepEqual(deliveryState, [
    "pendiente",
    "0",
    "t",
    "t",
  ]);
  // D31: verificar el registro de un intento fallido
  // directamente en PostgreSQL TEST.
  const failedDelivery = sql(`
    UPDATE admincond.invitaciones
    SET
      estado_entrega = 'fallido',
      intentos_entrega = intentos_entrega + 1,
      ultimo_intento_en = NOW(),
      enviado_en = NULL
    WHERE solicitud_id = ${solicitudId}
      AND estado = 'pendiente'
      AND estado_entrega = 'pendiente'
    RETURNING
      estado_entrega,
      intentos_entrega,
      ultimo_intento_en IS NOT NULL,
      enviado_en IS NULL;
  `).split("|");

  assert.deepEqual(failedDelivery, [
    "fallido",
    "1",
    "t",
    "t",
  ]);

  // Simular que un intento posterior fue aceptado
  // por el servidor SMTP.
  const acceptedDelivery = sql(`
    UPDATE admincond.invitaciones
    SET
      estado_entrega = 'enviado',
      intentos_entrega = intentos_entrega + 1,
      ultimo_intento_en = NOW(),
      enviado_en = NOW()
    WHERE solicitud_id = ${solicitudId}
      AND estado = 'pendiente'
      AND estado_entrega = 'fallido'
    RETURNING
      estado_entrega,
      intentos_entrega,
      ultimo_intento_en IS NOT NULL,
      enviado_en IS NOT NULL;
  `).split("|");

  assert.deepEqual(acceptedDelivery, [
    "enviado",
    "2",
    "t",
    "t",
  ]);

  // 4. Otro usuario NO puede aceptar la invitación.
  const unauthorizedResponse = await send(
    "/api/invitations/accept",
    "owner",
    {
      method: "POST",
      body: JSON.stringify({ token }),
    }
  );

  assert.equal(unauthorizedResponse.status, 403);

  // 5. El destinatario correcto acepta desde la API.
  const acceptResponse = await send(
    "/api/invitations/accept",
    "approval",
    {
      method: "POST",
      body: JSON.stringify({ token }),
    }
  );

  const acceptBody = await acceptResponse.json();

  assert.equal(
    acceptResponse.status,
    200,
    JSON.stringify(acceptBody)
  );

  assert.equal(
    acceptBody.message,
    "Invitación aceptada correctamente"
  );

  assert.equal(
    String(acceptBody.unidadId),
    String(unitId)
  );

  // 6. Confirmar que se utilizó la invitación.
  const invitationState = sql(`
    SELECT estado
    FROM admincond.invitaciones
    WHERE solicitud_id = ${solicitudId};
  `);

  assert.equal(invitationState, "utilizada");

  // 7. Verificar que se crearon las relaciones correctas.
  const membershipState = sql(`
    SELECT
      mc.rol,
      mc.estado,
      mco.rol,
      mco.estado,
      r.estado,
      r.es_ocupante,
      r.es_principal
    FROM admincond.usuarios u
    JOIN admincond.membresias_cliente mc
      ON mc.usuario_id = u.id
    JOIN admincond.condominios co
      ON co.cliente_id = mc.cliente_id
    JOIN admincond.membresias_condominio mco
      ON mco.usuario_id = u.id
     AND mco.cliente_id = mc.cliente_id
     AND mco.condominio_id = co.id
    JOIN admincond.relaciones_unidad r
      ON r.usuario_id = u.id
     AND r.condominio_id = co.id
    WHERE u.correo = '${emails.approval}'
      AND co.id = ${ids.condo}
      AND r.unidad_id = ${unitId};
  `).split("|");

  assert.deepEqual(membershipState, [
    "colaborador",
    "activo",
    "residente",
    "activo",
    "activo",
    "t",
    "f",
  ]);

  // 8. El token usado NO puede volver a aceptarse.
  const reusedResponse = await send(
    "/api/invitations/accept",
    "approval",
    {
      method: "POST",
      body: JSON.stringify({ token }),
    }
  );

  assert.equal(reusedResponse.status, 400);

  // El token permanece únicamente en memoria del test.
});

test("D31-16: dos conexiones compiten por reclamar una invitación", async () => {
  // Crear una invitación temporal directamente en TEST.
  // Este fixture es independiente de D31-01 y D31-02.
  const tokenHash = createHash("sha256")
    .update(randomBytes(32))
    .digest("hex");

  const invitationId = sql(`
    WITH solicitud AS (
      INSERT INTO admincond.solicitudes_residentes (
        unidad_id,
        condominio_id,
        solicitado_por,
        correo_invitado,
        estado,
        revisado_por,
        revisada_en
      )
      SELECT
        u.id,
        u.condominio_id,
        ${ids.resident},
        '${emails.approval}',
        'aprobada',
        ${ids.admin},
        NOW()
      FROM admincond.unidades u
      WHERE u.codigo = 'UNIT-A-${marker}'
        AND u.condominio_id = ${ids.condo}
      RETURNING id
    )
    INSERT INTO admincond.invitaciones (
      solicitud_id,
      token_hash,
      correo_destino,
      expira_en
    )
    SELECT
      id,
      '${tokenHash}',
      '${emails.approval}',
      NOW() + INTERVAL '48 hours'
    FROM solicitud
    RETURNING id;
  `);

  assert.match(invitationId, /^\d+$/);

  // Dos conexiones independientes hacia PostgreSQL TEST.
  const connection = {
    host: "127.0.0.1",
    port: 5434,
    database: "admincond_test",
    user: "admincond_test_api",
    password: env.DB_PASSWORD,
  };

  const firstClient = new Client(connection);
  const secondClient = new Client(connection);

  try {
    await Promise.all([
      firstClient.connect(),
      secondClient.connect(),
    ]);

    // Ambos intentan reclamar la misma invitación.
    const results = await Promise.all([
      claimInvitationDelivery(Number(invitationId), {
        query: firstClient.query.bind(firstClient),
      }),
      claimInvitationDelivery(Number(invitationId), {
        query: secondClient.query.bind(secondClient),
      }),
    ]);

    const successfulClaims = results.filter(
      (result) => result !== null
    );

    assert.equal(
      successfulClaims.length,
      1,
      "Solo una conexión debe obtener el reclamo"
    );

    // El estado final debe ser 'enviando'.
    const storedState = sql(`
      SELECT estado_entrega
      FROM admincond.invitaciones
      WHERE id = ${invitationId};
    `);

    assert.equal(storedState, "enviando");
    // Finalizar la entrega que fue reclamada correctamente.
    // No se contacta ningún servidor SMTP real.
    const recorded = await recordInvitationDelivery(
      Number(invitationId),
      true,
      {
        query: firstClient.query.bind(firstClient),
      }
    );

    assert.equal(recorded.estado_entrega, "enviado");
    assert.equal(recorded.intentos_entrega, 1);

    // Verificar el estado persistido en PostgreSQL.
    const finalState = sql(`
      SELECT
        estado_entrega,
        intentos_entrega,
        ultimo_intento_en IS NOT NULL,
        enviado_en IS NOT NULL
      FROM admincond.invitaciones
      WHERE id = ${invitationId};
    `).split("|");

    assert.deepEqual(finalState, [
      "enviado",
      "1",
      "t",
      "t",
    ]);

    // No debe ser posible registrar por segunda vez
    // una entrega que ya fue finalizada.
    await assert.rejects(
      recordInvitationDelivery(
        Number(invitationId),
        true,
        {
          query: secondClient.query.bind(secondClient),
        }
      ),
      {
        message:
          "Invitación no disponible para registrar entrega",
      }
    );

  } finally {
    await Promise.allSettled([
      firstClient.end(),
      secondClient.end(),
    ]);
  }
});

test("D31-17: solo administrador autorizado reemite invitación fallida", async () => {
  // Crear una invitación fallida independiente en TEST.
  const oldToken = randomBytes(32).toString("base64url");

  const oldHash = createHash("sha256")
    .update(oldToken)
    .digest("hex");

  const invitationId = sql(`
    WITH solicitud AS (
      INSERT INTO admincond.solicitudes_residentes (
        unidad_id,
        condominio_id,
        solicitado_por,
        correo_invitado,
        estado,
        revisado_por,
        revisada_en
      )
      SELECT
        u.id,
        u.condominio_id,
        ${ids.resident},
        '${emails.approval}',
        'aprobada',
        ${ids.admin},
        NOW()
      FROM admincond.unidades u
      WHERE u.codigo = 'UNIT-A-${marker}'
        AND u.condominio_id = ${ids.condo}
      RETURNING id
    )
    INSERT INTO admincond.invitaciones (
      solicitud_id,
      token_hash,
      correo_destino,
      expira_en,
      estado_entrega,
      intentos_entrega
    )
    SELECT
      id,
      '${oldHash}',
      '${emails.approval}',
      NOW() + INTERVAL '48 hours',
      'fallido',
      1
    FROM solicitud
    RETURNING id;
  `);

  assert.match(invitationId, /^\d+$/);

  const connection = {
    host: "127.0.0.1",
    port: 5434,
    database: "admincond_test",
    user: "admincond_test_api",
    password: env.DB_PASSWORD,
  };

  const client = new Client(connection);

  try {
    await client.connect();

    const query = client.query.bind(client);

    // 1. Usuario no autorizado intenta reemitir.
    const denied = await reissueFailedInvitation(
      ids.outsider,
      Number(invitationId),
      { query }
    );

    assert.equal(denied, null);

    // 2. Administrador autorizado reemite.
    const reissued = await reissueFailedInvitation(
      ids.admin,
      Number(invitationId),
      { query }
    );

    assert.ok(reissued);
    assert.equal(
      Number(reissued.invitationId),
      Number(invitationId)
    );
    assert.equal(reissued.to, emails.approval);
    assert.equal(reissued.expiresInHours, 48);
    assert.equal(typeof reissued.token, "string");

    // 3. Comprobar que el token cambió.
    assert.notEqual(reissued.token, oldToken);

    const newHash = createHash("sha256")
      .update(reissued.token)
      .digest("hex");

    assert.notEqual(newHash, oldHash);

    // 4. Verificar el nuevo estado en PostgreSQL.
    const stored = sql(`
      SELECT
        token_hash,
        estado_entrega,
        intentos_entrega
      FROM admincond.invitaciones
      WHERE id = ${invitationId};
    `).split("|");

    assert.deepEqual(stored, [
      newHash,
      "pendiente",
      "1",
    ]);

    // 5. El token anterior ya no puede aceptarse.
    const oldTokenResponse = await send(
      "/api/invitations/accept",
      "approval",
      {
        method: "POST",
        body: JSON.stringify({ token: oldToken }),
      }
    );

    assert.equal(oldTokenResponse.status, 400);

    // 6. Sin un nuevo fallo, no puede reemitirse otra vez.
    const secondReissue = await reissueFailedInvitation(
      ids.admin,
      Number(invitationId),
      { query }
    );

    assert.equal(secondReissue, null);
  } finally {
    await client.end();
  }
});

test("D31-18: rechazo administrativo no genera invitación", async () => {
  // Crear una solicitud pendiente exclusiva de esta prueba.
  const solicitudId = sql(`
    INSERT INTO admincond.solicitudes_residentes (
      unidad_id,
      condominio_id,
      solicitado_por,
      correo_invitado
    )
    SELECT
      u.id,
      u.condominio_id,
      ${ids.resident},
      '${emails.owner}',
      FROM_PLACEHOLDER
    FROM admincond.unidades u
    WHERE u.codigo = 'UNIT-A-${marker}'
      AND u.condominio_id = ${ids.condo}
    RETURNING id;
  `.replace(",\n      FROM_PLACEHOLDER", ""));

  assert.match(solicitudId, /^\d+$/);

  // El administrador rechaza mediante la API real.
  const response = await send(
    `/api/invitations/${solicitudId}/review`,
    "admin",
    {
      method: "POST",
      body: JSON.stringify({
        decision: "rechazar",
      }),
    }
  );

  const body = await response.json();

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.deepEqual(body, {
    estado: "rechazada",
  });

  // Confirmar que PostgreSQL registró el rechazo.
  const stored = sql(`
    SELECT
      estado,
      revisado_por,
      revisada_en IS NOT NULL
    FROM admincond.solicitudes_residentes
    WHERE id = ${solicitudId};
  `).split("|");

  assert.deepEqual(stored, [
    "rechazada",
    String(ids.admin),
    "t",
  ]);

  // Rechazar no debe crear una invitación.
  const invitationCount = sql(`
    SELECT COUNT(*)
    FROM admincond.invitaciones
    WHERE solicitud_id = ${solicitudId};
  `);

  assert.equal(invitationCount, "0");

  // No debe exponerse ningún token.
  assert.equal(body.invitacion, undefined);
});

test("D31-19: sin SMTP permite rechazar, pero no aprobar", async () => {
  const noMailUrl = "http://127.0.0.1:3002";

  // Comprobar que la segunda API responde.
  const health = await fetch(`${noMailUrl}/api/health`);
  assert.equal(health.status, 200);

  // Crea una solicitud pendiente en nuestra BD TEST.
  function createPendingRequest() {
    const solicitudId = sql(`
      INSERT INTO admincond.solicitudes_residentes (
        unidad_id,
        condominio_id,
        solicitado_por,
        correo_invitado
      )
      SELECT
        u.id,
        u.condominio_id,
        ${ids.resident},
        '${emails.owner}'
      FROM admincond.unidades u
      WHERE u.codigo = 'UNIT-A-${marker}'
        AND u.condominio_id = ${ids.condo}
      RETURNING id;
    `);

    assert.match(solicitudId, /^\d+$/);
    return solicitudId;
  }

  async function reviewOnNoMailApi(solicitudId, decision) {
    return fetch(
      `${noMailUrl}/api/invitations/${solicitudId}/review`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.admin}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ decision }),
      }
    );
  }

  // 1. Rechazar debe funcionar sin SMTP.
  const rejectedId = createPendingRequest();

  const rejectResponse = await reviewOnNoMailApi(
    rejectedId,
    "rechazar"
  );

  const rejectBody = await rejectResponse.json();

  assert.equal(
    rejectResponse.status,
    200,
    JSON.stringify(rejectBody)
  );

  assert.deepEqual(rejectBody, {
    estado: "rechazada",
  });

  const rejectedState = sql(`
    SELECT estado
    FROM admincond.solicitudes_residentes
    WHERE id = ${rejectedId};
  `);

  assert.equal(rejectedState, "rechazada");

  // 2. Crear otra solicitud independiente.
  const approvalId = createPendingRequest();

  // Intentar aprobar sin SMTP debe responder 503.
  const approvalResponse = await reviewOnNoMailApi(
    approvalId,
    "aprobar"
  );

  const approvalBody = await approvalResponse.json();

  assert.equal(
    approvalResponse.status,
    503,
    JSON.stringify(approvalBody)
  );

  assert.equal(
    approvalBody.message,
    "Servicio de invitaciones no disponible"
  );

  assert.equal(approvalBody.invitacion, undefined);

  // 3. Verificar que la solicitud NO fue aprobada.
  const approvalState = sql(`
    SELECT estado
    FROM admincond.solicitudes_residentes
    WHERE id = ${approvalId};
  `);

  assert.equal(approvalState, "pendiente");

  // 4. Verificar que NO se creó ninguna invitación.
  const invitationCount = sql(`
    SELECT COUNT(*)
    FROM admincond.invitaciones
    WHERE solicitud_id = ${approvalId};
  `);

  assert.equal(invitationCount, "0");
});

test("D31-20: API permite reemisión solo a administrador autorizado", async () => {
  // Crear una invitación fallida exclusiva de esta prueba.
  const oldToken = randomBytes(32).toString("base64url");

  const oldHash = createHash("sha256")
    .update(oldToken)
    .digest("hex");

  const invitationId = sql(`
    WITH solicitud AS (
      INSERT INTO admincond.solicitudes_residentes (
        unidad_id,
        condominio_id,
        solicitado_por,
        correo_invitado,
        estado,
        revisado_por,
        revisada_en
      )
      SELECT
        u.id,
        u.condominio_id,
        ${ids.resident},
        '${emails.approval}',
        'aprobada',
        ${ids.admin},
        NOW()
      FROM admincond.unidades u
      WHERE u.codigo = 'UNIT-A-${marker}'
        AND u.condominio_id = ${ids.condo}
      RETURNING id
    )
    INSERT INTO admincond.invitaciones (
      solicitud_id,
      token_hash,
      correo_destino,
      expira_en,
      estado_entrega,
      intentos_entrega
    )
    SELECT
      id,
      '${oldHash}',
      '${emails.approval}',
      NOW() + INTERVAL '48 hours',
      'fallido',
      1
    FROM solicitud
    RETURNING id;
  `);

  assert.match(invitationId, /^\d+$/);

  const path = `/api/invitations/${invitationId}/reissue`;

  // 1. Un usuario externo no puede reemitir.
  const deniedResponse = await send(
    path,
    "outsider",
    { method: "POST" }
  );

  assert.equal(deniedResponse.status, 404);

  // 2. El administrador autorizado sí puede reemitir.
  const approvedResponse = await send(
    path,
    "admin",
    { method: "POST" }
  );

  const approvedBody = await approvedResponse.json();

  assert.equal(
    approvedResponse.status,
    200,
    JSON.stringify(approvedBody)
  );

  assert.equal(approvedBody.estado, "reemitida");

  const newToken = approvedBody.invitacion?.token;

  assert.equal(typeof newToken, "string");
  assert.ok(newToken.length >= 32);
  assert.notEqual(newToken, oldToken);

  assert.equal(
    approvedBody.invitacion.correoDestino,
    emails.approval
  );

  // 3. PostgreSQL debe almacenar el nuevo hash,
  // nunca el token original.
  const newHash = createHash("sha256")
    .update(newToken)
    .digest("hex");

  const stored = sql(`
    SELECT
      token_hash,
      estado_entrega,
      intentos_entrega
    FROM admincond.invitaciones
    WHERE id = ${invitationId};
  `).split("|");

  assert.deepEqual(stored, [
    newHash,
    "pendiente",
    "1",
  ]);

  // 4. El token anterior debe haber perdido validez.
  const oldTokenResponse = await send(
    "/api/invitations/accept",
    "approval",
    {
      method: "POST",
      body: JSON.stringify({
        token: oldToken,
      }),
    }
  );

  assert.equal(oldTokenResponse.status, 400);

  // 5. No se puede reemitir otra vez sin un nuevo fallo.
  const repeatedResponse = await send(
    path,
    "admin",
    { method: "POST" }
  );

  assert.equal(repeatedResponse.status, 404);

  // No mostramos tokens en logs ni los guardamos en archivos.
});

test("D31-21: aprobación HTTP procesa correo simulado sin exponer token", async () => {
  const mailApiUrl = "http://127.0.0.1:3003";

  // 1. Comprobar la API de correo simulado.
  const health = await fetch(`${mailApiUrl}/api/health`);

  assert.equal(health.status, 200);

  // 2. Crear una solicitud pendiente exclusiva de esta prueba.
  // Utilizamos el destinatario approval, que ya es
  // una cuenta activa de nuestro laboratorio TEST.
  const solicitudId = sql(`
    INSERT INTO admincond.solicitudes_residentes (
      unidad_id,
      condominio_id,
      solicitado_por,
      correo_invitado
    )
    SELECT
      u.id,
      u.condominio_id,
      ${ids.resident},
      '${emails.approval}'
    FROM admincond.unidades u
    WHERE u.codigo = 'UNIT-A-${marker}'
      AND u.condominio_id = ${ids.condo}
    RETURNING id;
  `);

  assert.match(solicitudId, /^\d+$/);

  // 3. Aprobar desde la API con transporte simulado.
  const response = await fetch(
    `${mailApiUrl}/api/invitations/${solicitudId}/review`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.admin}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        decision: "aprobar",
      }),
    }
  );

  const body = await response.json();

  assert.equal(
    response.status,
    200,
    JSON.stringify(body)
  );

  assert.deepEqual(body, {
    estado: "aprobada",
    entrega: "enviado",
  });

  // 4. Verificar que el servidor no expuso el token.
  assert.equal(body.invitacion, undefined);
  assert.equal(body.token, undefined);
  assert.equal(body.refreshToken, undefined);

  // 5. Confirmar el estado de solicitud e invitación
  // directamente en PostgreSQL TEST.
  const stored = sql(`
    SELECT
      s.estado,
      i.estado,
      i.estado_entrega,
      i.intentos_entrega,
      i.ultimo_intento_en IS NOT NULL,
      i.enviado_en IS NOT NULL,
      i.correo_destino,
      LENGTH(i.token_hash)
    FROM admincond.solicitudes_residentes s
    JOIN admincond.invitaciones i
      ON i.solicitud_id = s.id
    WHERE s.id = ${solicitudId}
      AND s.condominio_id = ${ids.condo};
  `).split("|");

  assert.deepEqual(stored, [
    "aprobada",
    "pendiente",
    "enviado",
    "1",
    "t",
    "t",
    emails.approval,
    "64",
  ]);

  // 6. La invitación sigue pendiente de aceptación.
  // Que el transporte haya procesado el mensaje
  // no significa que el destinatario ya lo aceptó.
});