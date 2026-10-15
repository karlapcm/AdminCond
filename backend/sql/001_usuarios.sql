
-- Las tablas de AdminCond las administra el rol de migraciones.
SET ROLE admincond_migrator;

CREATE TABLE IF NOT EXISTS admincond.usuarios (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    correo VARCHAR(254) NOT NULL,
    password_hash TEXT NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'activo',
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT usuarios_estado_check
        CHECK (estado IN ('activo', 'suspendido'))
);

-- Evita correos duplicados, incluso con mayúsculas.
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_correo_unico
ON admincond.usuarios (LOWER(correo));

RESET ROLE;

-- El backend puede trabajar con usuarios,
-- pero no crear ni eliminar tablas.
GRANT USAGE ON SCHEMA admincond TO admincond_app;

GRANT SELECT, INSERT, UPDATE, DELETE
ON admincond.usuarios TO admincond_app;

GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA admincond TO admincond_app;
