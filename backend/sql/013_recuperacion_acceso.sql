
-- ADMINCOND V1 - DÍA 36
-- Recuperación segura de contraseñas.
--
-- Solo se almacena el hash del token.
-- El token original nunca se guarda en PostgreSQL.

BEGIN;

SET LOCAL ROLE admincond_migrator;

CREATE TABLE IF NOT EXISTS admincond.recuperaciones_acceso (
    id UUID PRIMARY KEY,

    usuario_id BIGINT NOT NULL
        REFERENCES admincond.usuarios(id)
        ON DELETE CASCADE,

    token_hash VARCHAR(64) NOT NULL UNIQUE,

    expira_en TIMESTAMPTZ NOT NULL,

    consumido_en TIMESTAMPTZ,

    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT recuperaciones_acceso_expiracion_check
        CHECK (expira_en > creado_en)
);

CREATE INDEX IF NOT EXISTS recuperaciones_acceso_usuario_idx
ON admincond.recuperaciones_acceso (usuario_id);

CREATE INDEX IF NOT EXISTS recuperaciones_acceso_expiracion_idx
ON admincond.recuperaciones_acceso (expira_en);

RESET ROLE;

-- La API trabaja con registros, pero no puede
-- modificar la estructura de la base de datos.

GRANT SELECT, INSERT, UPDATE
ON admincond.recuperaciones_acceso
TO admincond_app;

COMMIT;
