
-- ADMINCOND - DIA 18
-- Migracion 008: areas comunes y reservas.
-- Una reserva confirmada no puede superponerse con otra
-- reserva confirmada para la misma area.

BEGIN;

-- Necesaria para combinar BIGINT (=)
-- con rangos de tiempo (&&) en un indice GiST.
-- Ejecutar la migracion con el usuario administrador
-- de PostgreSQL usado en el laboratorio.
CREATE EXTENSION IF NOT EXISTS btree_gist;

SET LOCAL ROLE admincond_migrator;

-- =========================================
-- 1. AREAS COMUNES
-- =========================================

CREATE TABLE IF NOT EXISTS admincond.areas_comunes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    cliente_id BIGINT NOT NULL,
    condominio_id BIGINT NOT NULL,

    nombre VARCHAR(120) NOT NULL,
    descripcion VARCHAR(500),

    capacidad INTEGER,

    estado VARCHAR(20) NOT NULL DEFAULT 'activa',

    creada_por BIGINT NOT NULL
        REFERENCES admincond.usuarios(id),

    creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT areas_condominio_fk
        FOREIGN KEY (condominio_id, cliente_id)
        REFERENCES admincond.condominios(id, cliente_id),

    CONSTRAINT areas_id_condominio_unique
        UNIQUE (id, condominio_id),

    CONSTRAINT areas_nombre_unique
        UNIQUE (condominio_id, nombre),

    CONSTRAINT areas_nombre_check
        CHECK (
            LENGTH(TRIM(nombre)) BETWEEN 1 AND 120
        ),

    CONSTRAINT areas_capacidad_check
        CHECK (
            capacidad IS NULL OR capacidad > 0
        ),

    CONSTRAINT areas_estado_check
        CHECK (estado IN ('activa', 'inactiva'))
);

-- =========================================
-- 2. RESERVAS
-- =========================================

CREATE TABLE IF NOT EXISTS admincond.reservas_areas (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    area_id BIGINT NOT NULL,
    condominio_id BIGINT NOT NULL,

    unidad_id BIGINT NOT NULL,

    usuario_id BIGINT NOT NULL
        REFERENCES admincond.usuarios(id),

    inicio TIMESTAMPTZ NOT NULL,
    fin TIMESTAMPTZ NOT NULL,

    estado VARCHAR(20) NOT NULL DEFAULT 'confirmada',

    creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    cancelada_por BIGINT
        REFERENCES admincond.usuarios(id),

    cancelada_en TIMESTAMPTZ,

    CONSTRAINT reservas_area_fk
        FOREIGN KEY (area_id, condominio_id)
        REFERENCES admincond.areas_comunes(id, condominio_id),

    CONSTRAINT reservas_unidad_fk
        FOREIGN KEY (unidad_id, condominio_id)
        REFERENCES admincond.unidades(id, condominio_id),

    CONSTRAINT reservas_fechas_check
        CHECK (fin > inicio),

    CONSTRAINT reservas_duracion_check
        CHECK (
            fin - inicio >= INTERVAL '30 minutes'
            AND fin - inicio <= INTERVAL '4 hours'
        ),

    CONSTRAINT reservas_estado_check
        CHECK (
            estado IN ('confirmada', 'cancelada')
        ),

    CONSTRAINT reservas_cancelacion_check
        CHECK (
            (
                estado = 'confirmada'
                AND cancelada_por IS NULL
                AND cancelada_en IS NULL
            )
            OR
            (
                estado = 'cancelada'
                AND cancelada_por IS NOT NULL
                AND cancelada_en IS NOT NULL
            )
        )
);

-- =========================================
-- 3. EVITAR HORARIOS SUPERPUESTOS
-- =========================================

ALTER TABLE admincond.reservas_areas
ADD CONSTRAINT reservas_sin_superposicion
EXCLUDE USING gist (
    area_id WITH =,
    tstzrange(inicio, fin, '[)') WITH &&
)
WHERE (estado = 'confirmada');

-- =========================================
-- 4. INDICES
-- =========================================

CREATE INDEX IF NOT EXISTS idx_areas_condominio
ON admincond.areas_comunes(
    condominio_id,
    estado
);

CREATE INDEX IF NOT EXISTS idx_reservas_condominio
ON admincond.reservas_areas(
    condominio_id,
    inicio
);

CREATE INDEX IF NOT EXISTS idx_reservas_usuario
ON admincond.reservas_areas(
    usuario_id,
    inicio DESC
);

-- =========================================
-- 5. PERMISOS SQL
-- =========================================

RESET ROLE;

GRANT SELECT, INSERT, UPDATE
ON admincond.areas_comunes,
   admincond.reservas_areas
TO admincond_app;

GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA admincond
TO admincond_app;

COMMIT;
