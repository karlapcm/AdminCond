
import test from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const root = fileURLToPath(
  new URL("../../", import.meta.url)
);

const docker =
  process.platform === "win32" ? "docker.exe" : "docker";

function args(sql) {
  return [
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
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "admincond_test",
    "-c",
    sql,
  ];
}

function runSql(sql) {
  return execFileSync(docker, args(sql), {
    cwd: root,
    encoding: "utf8",
    timeout: 20000,
  }).trim();
}

function runSqlAsync(sql) {
  return execFileAsync(docker, args(sql), {
    cwd: root,
    encoding: "utf8",
    timeout: 20000,
  });
}

test(
  "D20-08: dos reservas concurrentes no pueden superponerse",
  { timeout: 45000 },
  async () => {
    // El UUID hace únicos los datos de cada ejecución.
    const marker = `D20-${randomUUID()}`;

    const emailA = `a-${marker}@admincond.test`;
    const emailB = `b-${marker}@admincond.test`;

    const unitCodeA = `A-${marker}`;
    const unitCodeB = `B-${marker}`;

    // Estos horarios son datos sintéticos.
    // No necesitan representar una reserva real.
    const start = "2099-10-30T14:00:00Z";
    const end = "2099-10-30T16:00:00Z";

    // Elimina solamente los registros identificados
    // con el marcador único de esta prueba.
    function cleanup() {
      runSql(`
        BEGIN;

        DELETE FROM admincond.reservas_areas
        WHERE area_id IN (
          SELECT id
          FROM admincond.areas_comunes
          WHERE nombre = '${marker}'
        );

        DELETE FROM admincond.areas_comunes
        WHERE nombre = '${marker}';

        DELETE FROM admincond.unidades
        WHERE codigo IN (
          '${unitCodeA}',
          '${unitCodeB}'
        );

        DELETE FROM admincond.condominios
        WHERE nombre = '${marker}';

        DELETE FROM admincond.clientes
        WHERE nombre = '${marker}';

        DELETE FROM admincond.usuarios
        WHERE correo IN (
          '${emailA}',
          '${emailB}'
        );

        COMMIT;
      `);
    }

    try {
      // Protección antes de crear datos.
      assert.equal(
        runSql("SELECT current_database();"),
        "admincond_test"
      );

      // Los datos se crean en una sola transacción.
      // Si una inserción falla, no queda un fixture parcial.
      runSql(`
        DO $$
        DECLARE
          user_a BIGINT;
          user_b BIGINT;
          client_id BIGINT;
          condo_id BIGINT;
        BEGIN
          IF current_database() <> 'admincond_test' THEN
            RAISE EXCEPTION 'Base incorrecta';
          END IF;

          INSERT INTO admincond.usuarios (
            nombre, correo, password_hash
          )
          VALUES (
            'Test A',
            '${emailA}',
            'NO_LOGIN_TEST'
          )
          RETURNING id INTO user_a;

          INSERT INTO admincond.usuarios (
            nombre, correo, password_hash
          )
          VALUES (
            'Test B',
            '${emailB}',
            'NO_LOGIN_TEST'
          )
          RETURNING id INTO user_b;

          INSERT INTO admincond.clientes (nombre)
          VALUES ('${marker}')
          RETURNING id INTO client_id;

          INSERT INTO admincond.condominios (
            cliente_id, nombre
          )
          VALUES (
            client_id, '${marker}'
          )
          RETURNING id INTO condo_id;

          INSERT INTO admincond.unidades (
            condominio_id, codigo, tipo
          )
          VALUES
            (condo_id, '${unitCodeA}', 'casa'),
            (condo_id, '${unitCodeB}', 'casa');

          INSERT INTO admincond.areas_comunes (
            cliente_id,
            condominio_id,
            nombre,
            creada_por
          )
          VALUES (
            client_id,
            condo_id,
            '${marker}',
            user_a
          );
        END
        $$;
      `);

      // Identificadores realmente generados por PostgreSQL.
      const ids = runSql(`
        SELECT
          (SELECT id FROM admincond.areas_comunes
           WHERE nombre = '${marker}')
          || '|' ||
          (SELECT id FROM admincond.condominios
           WHERE nombre = '${marker}')
          || '|' ||
          (SELECT id FROM admincond.unidades
           WHERE codigo = '${unitCodeA}')
          || '|' ||
          (SELECT id FROM admincond.usuarios
           WHERE correo = '${emailA}')
          || '|' ||
          (SELECT id FROM admincond.unidades
           WHERE codigo = '${unitCodeB}')
          || '|' ||
          (SELECT id FROM admincond.usuarios
           WHERE correo = '${emailB}');
      `).split("|");

      assert.equal(ids.length, 6);
      assert.ok(ids.every((id) => /^\d+$/.test(id)));

      const [
        areaId,
        condoId,
        unitA,
        userA,
        unitB,
        userB,
      ] = ids;

      function bookingSql(unitId, userId) {
        return `
          BEGIN;

          INSERT INTO admincond.reservas_areas (
            area_id,
            condominio_id,
            unidad_id,
            usuario_id,
            inicio,
            fin
          )
          VALUES (
            ${areaId},
            ${condoId},
            ${unitId},
            ${userId},
            '${start}'::timestamptz,
            '${end}'::timestamptz
          );

          -- Mantiene abierta la transacción ganadora
          -- para provocar competencia entre conexiones.
          SELECT pg_sleep(2);

          COMMIT;
        `;
      }

      // Dos procesos independientes intentan insertar
      // reservas en exactamente el mismo horario.
      const results = await Promise.allSettled([
        runSqlAsync(bookingSql(unitA, userA)),
        runSqlAsync(bookingSql(unitB, userB)),
      ]);

      const accepted = results.filter(
        (result) => result.status === "fulfilled"
      );

      const rejected = results.filter(
        (result) => result.status === "rejected"
      );

      assert.equal(
        accepted.length,
        1,
        "Debe confirmarse exactamente una reserva"
      );

      assert.equal(
        rejected.length,
        1,
        "Debe rechazarse exactamente una reserva"
      );

      // No basta con que una falle: debe fallar
      // específicamente por la restricción de exclusión.
      const errorText = [
        rejected[0].reason?.stderr,
        rejected[0].reason?.message,
      ].filter(Boolean).join("\n");

      assert.match(
        errorText,
        /reservas_sin_superposicion|exclusion constraint/i
      );

      const confirmed = runSql(`
        SELECT COUNT(*)
        FROM admincond.reservas_areas
        WHERE area_id = ${areaId}
          AND estado = 'confirmada';
      `);

      assert.equal(
        Number(confirmed),
        1,
        "PostgreSQL debe almacenar solo una reserva"
      );
    } finally {
      // Limpieza aunque una afirmación falle.
      cleanup();
    }
  }
);
