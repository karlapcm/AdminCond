
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(
  new URL("../../", import.meta.url)
);

const dockerCommand =
  process.platform === "win32" ? "docker.exe" : "docker";

function queryTestDatabase(sql) {
  const result = execFileSync(
    dockerCommand,
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
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "admincond_test",
      "-c",
      sql,
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      timeout: 15000,
    }
  );

  return result.trim();
}

test("D20-01: utiliza exclusivamente admincond_test", () => {
  const database = queryTestDatabase(
    "SELECT current_database();"
  );

  assert.equal(database, "admincond_test");
});

test("D20-02: existen las 19 tablas del esquema", () => {
  const count = queryTestDatabase(`
    SELECT COUNT(*)
    FROM information_schema.tables
    WHERE table_schema = 'admincond'
      AND table_type = 'BASE TABLE';
  `);

  assert.equal(Number(count), 19);
});

test("D20-03: las tablas pertenecen al migrador", () => {
  const owners = queryTestDatabase(`
    SELECT COUNT(*)
    FROM pg_tables
    WHERE schemaname = 'admincond'
      AND tableowner <> 'admincond_migrator';
  `);

  assert.equal(Number(owners), 0);
});

test("D20-04: el rol app no puede crear tablas", () => {
  const permission = queryTestDatabase(`
    SELECT has_schema_privilege(
      'admincond_app',
      'admincond',
      'CREATE'
    );
  `);

  assert.equal(permission, "f");
});

test("D20-05: app puede consultar reservas", () => {
  const permission = queryTestDatabase(`
    SELECT has_table_privilege(
      'admincond_app',
      'admincond.reservas_areas',
      'SELECT'
    );
  `);

  assert.equal(permission, "t");
});

test("D20-06: app no puede eliminar reservas", () => {
  const permission = queryTestDatabase(`
    SELECT has_table_privilege(
      'admincond_app',
      'admincond.reservas_areas',
      'DELETE'
    );
  `);

  assert.equal(permission, "f");
});

test("D20-07: existe la restricción GiST", () => {
  const definition = queryTestDatabase(`
    SELECT pg_get_constraintdef(oid)
    FROM pg_constraint
    WHERE conrelid =
      'admincond.reservas_areas'::regclass
      AND conname = 'reservas_sin_superposicion'
      AND contype = 'x';
  `);

  assert.match(definition, /EXCLUDE USING gist/i);
  assert.match(definition, /area_id WITH =/i);
  assert.match(definition, /tstzrange/i);
  assert.match(definition, /WITH &&/i);
  assert.match(definition, /confirmada/i);
});
