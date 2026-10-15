
-- Día 7: sesiones de autenticación de AdminCond

-- Ejecutar esta migración como postgres.
-- Las tablas serán propiedad de admincond_migrator.

SET ROLE admincond_migrator;

CREATE TABLE IF NOT EXISTS admincond.sesiones (
    id UUID PRIMARY KEY,

    usuario_id BIGINT NOT NULL
        REFERENCES admincond.usuarios(id)
        ON DELETE CASCADE,

    refresh_hash TEXT NOT NULL UNIQUE,

    expira_en TIMESTAMPTZ NOT NULL,

    revocada_en TIMESTAMPTZ,

    creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sesiones_usuario_idx
ON admincond.sesiones(usuario_id);

RESET ROLE;

-- Permitir que la aplicación gestione sesiones,
-- sin concederle privilegios de administración.

GRANT USAGE ON SCHEMA admincond TO admincond_app;

GRANT SELECT, INSERT, UPDATE, DELETE
ON admincond.sesiones TO admincond_app;
