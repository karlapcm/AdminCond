
-- ADMINCOND - DÍA 8
-- Clientes, condominios y membresías

SET ROLE admincond_migrator;

-- 1. Clientes que contratan AdminCond
CREATE TABLE IF NOT EXISTS admincond.clientes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'activo',
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT clientes_estado_check
        CHECK (estado IN ('activo', 'suspendido'))
);

-- 2. Condominios pertenecientes a un cliente
CREATE TABLE IF NOT EXISTS admincond.condominios (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cliente_id BIGINT NOT NULL
        REFERENCES admincond.clientes(id),
    nombre VARCHAR(150) NOT NULL,
    direccion VARCHAR(250),
    estado VARCHAR(20) NOT NULL DEFAULT 'activo',
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT condominios_estado_check
        CHECK (estado IN ('activo', 'suspendido')),

    CONSTRAINT condominios_id_cliente_unique
        UNIQUE (id, cliente_id)
);

-- 3. Pertenencia de usuarios a clientes
CREATE TABLE IF NOT EXISTS admincond.membresias_cliente (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id BIGINT NOT NULL
        REFERENCES admincond.usuarios(id),
    cliente_id BIGINT NOT NULL
        REFERENCES admincond.clientes(id),
    rol VARCHAR(30) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'activo',

    CONSTRAINT membresias_cliente_rol_check
        CHECK (rol IN ('supercliente', 'colaborador')),

    CONSTRAINT membresias_cliente_estado_check
        CHECK (estado IN ('activo', 'revocado')),

    CONSTRAINT membresias_cliente_unique
        UNIQUE (usuario_id, cliente_id)
);

-- 4. Asignación de usuarios a condominios
CREATE TABLE IF NOT EXISTS admincond.membresias_condominio (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id BIGINT NOT NULL
        REFERENCES admincond.usuarios(id),
    cliente_id BIGINT NOT NULL
        REFERENCES admincond.clientes(id),
    condominio_id BIGINT NOT NULL,
    rol VARCHAR(30) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'activo',

    CONSTRAINT membresias_condominio_rol_check
        CHECK (rol IN ('administrador', 'residente')),

    CONSTRAINT membresias_condominio_estado_check
        CHECK (estado IN ('activo', 'revocado')),

    CONSTRAINT membresias_condominio_condominio_fk
        FOREIGN KEY (condominio_id, cliente_id)
        REFERENCES admincond.condominios(id, cliente_id),

    CONSTRAINT membresias_condominio_unique
        UNIQUE (usuario_id, condominio_id)
);

-- Índices para consultar membresías
CREATE INDEX IF NOT EXISTS idx_membresias_cliente_usuario
ON admincond.membresias_cliente(usuario_id);

CREATE INDEX IF NOT EXISTS idx_membresias_condominio_usuario
ON admincond.membresias_condominio(usuario_id);

CREATE INDEX IF NOT EXISTS idx_condominios_cliente
ON admincond.condominios(cliente_id);

RESET ROLE;

-- Permisos de la aplicación sobre estas tablas
GRANT SELECT, INSERT, UPDATE, DELETE
ON admincond.clientes,
   admincond.condominios,
   admincond.membresias_cliente,
   admincond.membresias_condominio
TO admincond_app;

GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA admincond
TO admincond_app;
