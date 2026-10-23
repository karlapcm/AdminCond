
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash,} from "node:crypto";
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
