
-- ADMINCOND - DÍA 9
-- Estructura física y relaciones de usuarios con unidades.

BEGIN;

SET LOCAL ROLE admincond_migrator;

-- 1. Sectores o etapas opcionales
CREATE TABLE IF NOT EXISTS admincond.sectores (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    condominio_id BIGINT NOT NULL
        REFERENCES admincond.condominios(id),
    nombre VARCHAR(120) NOT NULL,

    CONSTRAINT sectores_condominio_id_unique
        UNIQUE (id, condominio_id),

    CONSTRAINT sectores_nombre_unique
        UNIQUE (condominio_id, nombre)
);

-- 2. Edificios, torres o bloques opcionales
CREATE TABLE IF NOT EXISTS admincond.edificios (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    condominio_id BIGINT NOT NULL,
    sector_id BIGINT,
    nombre VARCHAR(120) NOT NULL,

    CONSTRAINT edificios_condominio_fk
        FOREIGN KEY (condominio_id)
        REFERENCES admincond.condominios(id),

    CONSTRAINT edificios_sector_fk
        FOREIGN KEY (sector_id, condominio_id)
        REFERENCES admincond.sectores(id, condominio_id),

    CONSTRAINT edificios_condominio_id_unique
        UNIQUE (id, condominio_id),

    CONSTRAINT edificios_nombre_unique
        UNIQUE (condominio_id, nombre)
);

-- 3. Departamentos, casas y otras unidades
CREATE TABLE IF NOT EXISTS admincond.unidades (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    condominio_id BIGINT NOT NULL
        REFERENCES admincond.condominios(id),

    sector_id BIGINT,
    edificio_id BIGINT,

    codigo VARCHAR(50) NOT NULL,

    tipo VARCHAR(20) NOT NULL,

    estado VARCHAR(20) NOT NULL DEFAULT 'activa',

    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unidades_tipo_check
        CHECK (tipo IN ('departamento', 'casa', 'otro')),

    CONSTRAINT unidades_estado_check
        CHECK (estado IN ('activa', 'inactiva')),

    -- Un mismo código no se repite dentro del condominio.
    CONSTRAINT unidades_codigo_unique
        UNIQUE (condominio_id, codigo),

    -- Sector directo y edificio no se especifican juntos.
    -- Si la unidad pertenece a un edificio, el sector
    -- correspondiente se obtiene desde ese edificio.
    CONSTRAINT unidades_ubicacion_check
        CHECK (sector_id IS NULL OR edificio_id IS NULL),

    -- Impide enlazar un sector de otro condominio.
    CONSTRAINT unidades_sector_fk
        FOREIGN KEY (sector_id, condominio_id)
        REFERENCES admincond.sectores(id, condominio_id),

    -- Impide enlazar un edificio de otro condominio.
    CONSTRAINT unidades_edificio_fk
        FOREIGN KEY (edificio_id, condominio_id)
        REFERENCES admincond.edificios(id, condominio_id),

    CONSTRAINT unidades_id_condominio_unique
        UNIQUE (id, condominio_id)
);

-- 4. Relación de una persona con una vivienda
CREATE TABLE IF NOT EXISTS admincond.relaciones_unidad (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    usuario_id BIGINT NOT NULL
        REFERENCES admincond.usuarios(id),

    condominio_id BIGINT NOT NULL,

    unidad_id BIGINT NOT NULL,

    es_propietario BOOLEAN NOT NULL DEFAULT FALSE,
    es_inquilino BOOLEAN NOT NULL DEFAULT FALSE,
    es_ocupante BOOLEAN NOT NULL DEFAULT FALSE,
    responsable_pago BOOLEAN NOT NULL DEFAULT FALSE,
    es_principal BOOLEAN NOT NULL DEFAULT FALSE,

    estado VARCHAR(20) NOT NULL DEFAULT 'activo',

    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT relaciones_unidad_fk
        FOREIGN KEY (unidad_id, condominio_id)
        REFERENCES admincond.unidades(id, condominio_id),

    CONSTRAINT relaciones_estado_check
        CHECK (estado IN ('activo', 'revocado')),

    CONSTRAINT relaciones_tipo_check
        CHECK (
            es_propietario
            OR es_inquilino
            OR es_ocupante
            OR responsable_pago
        ),

    CONSTRAINT relaciones_usuario_unidad_unique
        UNIQUE (usuario_id, unidad_id)
);

-- Una unidad puede tener varios residentes,
-- pero solamente un responsable principal activo.
CREATE UNIQUE INDEX IF NOT EXISTS
    idx_unidad_principal_activo
ON admincond.relaciones_unidad(unidad_id)
WHERE es_principal = TRUE
  AND estado = 'activo';

-- Índices para búsquedas
CREATE INDEX IF NOT EXISTS idx_unidades_condominio
ON admincond.unidades(condominio_id);

CREATE INDEX IF NOT EXISTS idx_relaciones_usuario
ON admincond.relaciones_unidad(usuario_id);

CREATE INDEX IF NOT EXISTS idx_relaciones_unidad
ON admincond.relaciones_unidad(unidad_id);

-- Permisos de lectura/escritura para la API.
-- Más adelante limitaremos cada operación con
-- servicios y comprobaciones de autorización.
RESET ROLE;

GRANT SELECT, INSERT, UPDATE, DELETE
ON admincond.sectores,
   admincond.edificios,
   admincond.unidades,
   admincond.relaciones_unidad
TO admincond_app;

GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA admincond
TO admincond_app;

COMMIT;
