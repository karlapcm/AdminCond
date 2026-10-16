
-- ADMINCOND - DÍA 11
-- Base del módulo financiero V1
-- Cuotas, pagos manuales, comprobantes
-- y permisos financieros por condominio.

BEGIN;

SET LOCAL ROLE admincond_migrator;

-- 1. Permisos financieros específicos.
-- NO se otorgan por ser administrador.

CREATE TABLE IF NOT EXISTS admincond.permisos_financieros (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    usuario_id BIGINT NOT NULL
        REFERENCES admincond.usuarios(id),

    condominio_id BIGINT NOT NULL
        REFERENCES admincond.condominios(id),

    permiso VARCHAR(30) NOT NULL,

    estado VARCHAR(20) NOT NULL DEFAULT 'activo',

    otorgado_por BIGINT NOT NULL
        REFERENCES admincond.usuarios(id),

    otorgado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    revocado_por BIGINT
        REFERENCES admincond.usuarios(id),

    revocado_en TIMESTAMPTZ,

    CONSTRAINT permisos_financieros_tipo_check
        CHECK (permiso IN (
            'crear_cuotas',
            'revisar_pagos',
            'consultar_finanzas'
        )),

    CONSTRAINT permisos_financieros_estado_check
        CHECK (estado IN ('activo', 'revocado')),

    CONSTRAINT permisos_financieros_unique
        UNIQUE (usuario_id, condominio_id, permiso),

    CONSTRAINT permisos_financieros_revocacion_check
        CHECK (
            (estado = 'activo'
                AND revocado_en IS NULL
                AND revocado_por IS NULL)
            OR
            (estado = 'revocado'
                AND revocado_en IS NOT NULL
                AND revocado_por IS NOT NULL)
        )
);

-- 2. Cuotas de mantenimiento por vivienda.

CREATE TABLE IF NOT EXISTS admincond.cuotas (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    condominio_id BIGINT NOT NULL,
    unidad_id BIGINT NOT NULL,

    concepto VARCHAR(200) NOT NULL,

    periodo DATE NOT NULL,

    monto NUMERIC(12,2) NOT NULL,

    vencimiento DATE NOT NULL,

    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',

    creada_por BIGINT NOT NULL
        REFERENCES admincond.usuarios(id),

    creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT cuotas_unidad_fk
        FOREIGN KEY (unidad_id, condominio_id)
        REFERENCES admincond.unidades(id, condominio_id),

    CONSTRAINT cuotas_monto_check
        CHECK (monto > 0),

    CONSTRAINT cuotas_estado_check
        CHECK (estado IN (
            'pendiente',
            'parcial',
            'pagada',
            'anulada'
        )),

    CONSTRAINT cuotas_id_condominio_unique
        UNIQUE (id, condominio_id),

    CONSTRAINT cuotas_periodo_unique
        UNIQUE (unidad_id, concepto, periodo)
);

-- 3. Pagos reportados manualmente.

CREATE TABLE IF NOT EXISTS admincond.pagos (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    cuota_id BIGINT NOT NULL,
    condominio_id BIGINT NOT NULL,

    monto NUMERIC(12,2) NOT NULL,

    referencia VARCHAR(150),

    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',

    registrado_por BIGINT NOT NULL
        REFERENCES admincond.usuarios(id),

    registrado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    revisado_por BIGINT
        REFERENCES admincond.usuarios(id),

    revisado_en TIMESTAMPTZ,

    CONSTRAINT pagos_cuota_fk
        FOREIGN KEY (cuota_id, condominio_id)
        REFERENCES admincond.cuotas(id, condominio_id),

    CONSTRAINT pagos_monto_check
        CHECK (monto > 0),

    CONSTRAINT pagos_estado_check
        CHECK (estado IN (
            'pendiente',
            'aprobado',
            'rechazado'
        )),

    -- Una persona no puede revisar su propio pago.
    CONSTRAINT pagos_separacion_funciones_check
        CHECK (
            revisado_por IS NULL
            OR revisado_por <> registrado_por
        ),

    CONSTRAINT pagos_revision_check
        CHECK (
            (estado = 'pendiente'
                AND revisado_por IS NULL
                AND revisado_en IS NULL)
            OR
            (estado <> 'pendiente'
                AND revisado_por IS NOT NULL
                AND revisado_en IS NOT NULL)
        )
);

-- 4. Metadatos de comprobantes privados.
-- No almacenamos enlaces públicos ni archivos
-- binarios directamente en esta tabla.

CREATE TABLE IF NOT EXISTS admincond.comprobantes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    pago_id BIGINT NOT NULL
        REFERENCES admincond.pagos(id),

    almacenamiento_clave TEXT NOT NULL UNIQUE,

    nombre_original VARCHAR(255) NOT NULL,

    tipo_mime VARCHAR(100) NOT NULL,

    tamano_bytes BIGINT NOT NULL,

    subido_por BIGINT NOT NULL
        REFERENCES admincond.usuarios(id),

    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT comprobantes_tamano_check
        CHECK (tamano_bytes > 0)
);

-- 5. Índices para consultas frecuentes.

CREATE INDEX IF NOT EXISTS idx_cuotas_unidad
ON admincond.cuotas(unidad_id, estado);

CREATE INDEX IF NOT EXISTS idx_cuotas_condominio
ON admincond.cuotas(condominio_id, periodo);

CREATE INDEX IF NOT EXISTS idx_pagos_cuota
ON admincond.pagos(cuota_id, estado);

CREATE INDEX IF NOT EXISTS idx_pagos_condominio
ON admincond.pagos(condominio_id, estado);

CREATE INDEX IF NOT EXISTS idx_permisos_financieros
ON admincond.permisos_financieros(
    usuario_id,
    condominio_id,
    permiso
)
WHERE estado = 'activo';

RESET ROLE;

-- El usuario de la API necesita permisos SQL.
-- Express será responsable de comprobar
-- autorizaciones y reglas de negocio.
-- Ninguna ruta de escritura queda pública
-- por ejecutar esta migración.

GRANT SELECT, INSERT, UPDATE, DELETE
ON admincond.permisos_financieros,
   admincond.cuotas,
   admincond.pagos,
   admincond.comprobantes
TO admincond_app;

GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA admincond
TO admincond_app;

COMMIT;
