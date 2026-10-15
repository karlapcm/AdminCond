
-- ADMINCOND - DÍA 10
-- Solicitudes e invitaciones de residentes.

BEGIN;

SET LOCAL ROLE admincond_migrator;

-- 1. Solicitudes para agregar residentes.
CREATE TABLE IF NOT EXISTS admincond.solicitudes_residentes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    unidad_id BIGINT NOT NULL,
    condominio_id BIGINT NOT NULL,

    solicitado_por BIGINT NOT NULL
        REFERENCES admincond.usuarios(id),

    correo_invitado VARCHAR(254) NOT NULL,

    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',

    revisado_por BIGINT
        REFERENCES admincond.usuarios(id),

    motivo_rechazo TEXT,

    creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revisada_en TIMESTAMPTZ,

    CONSTRAINT solicitudes_unidad_fk
        FOREIGN KEY (unidad_id, condominio_id)
        REFERENCES admincond.unidades(id, condominio_id),

    CONSTRAINT solicitudes_estado_check
        CHECK (estado IN (
            'pendiente',
            'aprobada',
            'rechazada'
        )),

    CONSTRAINT solicitudes_revision_check
        CHECK (
            (estado = 'pendiente'
             AND revisado_por IS NULL
             AND revisada_en IS NULL)
            OR
            (estado <> 'pendiente'
             AND revisado_por IS NOT NULL
             AND revisada_en IS NOT NULL)
        )
);

-- Evitar solicitudes pendientes duplicadas
-- para el mismo correo y la misma unidad.
CREATE UNIQUE INDEX IF NOT EXISTS
    idx_solicitud_pendiente_unica
ON admincond.solicitudes_residentes (
    unidad_id,
    LOWER(correo_invitado)
)
WHERE estado = 'pendiente';

-- 2. Invitaciones emitidas tras la aprobación.
CREATE TABLE IF NOT EXISTS admincond.invitaciones (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    solicitud_id BIGINT NOT NULL UNIQUE
        REFERENCES admincond.solicitudes_residentes(id),

    token_hash TEXT NOT NULL UNIQUE,

    correo_destino VARCHAR(254) NOT NULL,

    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',

    creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expira_en TIMESTAMPTZ NOT NULL,

    utilizada_en TIMESTAMPTZ,

    usuario_acepto BIGINT
        REFERENCES admincond.usuarios(id),

    CONSTRAINT invitaciones_estado_check
        CHECK (estado IN (
            'pendiente',
            'utilizada',
            'revocada'
        )),

    CONSTRAINT invitaciones_vigencia_check
        CHECK (expira_en > creada_en),

    CONSTRAINT invitaciones_uso_check
        CHECK (
            (estado = 'utilizada'
             AND utilizada_en IS NOT NULL
             AND usuario_acepto IS NOT NULL)
            OR
            (estado <> 'utilizada'
             AND utilizada_en IS NULL
             AND usuario_acepto IS NULL)
        )
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_condominio
ON admincond.solicitudes_residentes(
    condominio_id,
    estado
);

CREATE INDEX IF NOT EXISTS idx_invitaciones_expiracion
ON admincond.invitaciones(
    expira_en
)
WHERE estado = 'pendiente';

RESET ROLE;

-- Permisos SQL de la API.
-- Las autorizaciones por usuario se validarán
-- en los servicios de Express.

GRANT SELECT, INSERT, UPDATE, DELETE
ON admincond.solicitudes_residentes,
   admincond.invitaciones
TO admincond_app;

GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA admincond
TO admincond_app;

COMMIT;
