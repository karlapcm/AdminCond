
-- AdminCond - Dia 20
-- Bootstrap exclusivo de la base admincond_test.
-- Ejecutar como postgres SOLO en PostgreSQL TEST.

\set ON_ERROR_STOP on

DO $$
BEGIN
    IF current_database() <> 'admincond_test' THEN
        RAISE EXCEPTION
            'Bootstrap bloqueado: base de datos incorrecta';
    END IF;
END
$$;

-- Crear roles de pruebas sin capacidad de iniciar sesión.
-- Las credenciales de testing se configurarán por separado.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_roles
        WHERE rolname = 'admincond_migrator'
    ) THEN
        CREATE ROLE admincond_migrator NOLOGIN;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_roles
        WHERE rolname = 'admincond_app'
    ) THEN
        CREATE ROLE admincond_app NOLOGIN;
    END IF;
END
$$;

-- El rol migrador será propietario del esquema.
CREATE SCHEMA IF NOT EXISTS admincond
    AUTHORIZATION admincond_migrator;

-- El backend podrá utilizar el esquema,
-- pero no recibirá permisos para crear tablas.
GRANT USAGE ON SCHEMA admincond
    TO admincond_app;

REVOKE CREATE ON SCHEMA admincond
    FROM PUBLIC;

-- Mostrar resultados.
SELECT
    current_database() AS base_actual,
    schema_name,
    schema_owner
FROM information_schema.schemata
WHERE schema_name = 'admincond';
