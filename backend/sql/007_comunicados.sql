
-- ADMINCOND - DIA 16
-- Migracion 007: comunicados de condominios

SET ROLE admincond_migrator;

CREATE TABLE IF NOT EXISTS admincond.comunicados (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    cliente_id BIGINT NOT NULL,

    condominio_id BIGINT NOT NULL,

    autor_id BIGINT NOT NULL
        REFERENCES admincond.usuarios(id),

    titulo VARCHAR(150) NOT NULL,

    contenido TEXT NOT NULL,

    estado VARCHAR(20) NOT NULL DEFAULT 'publicado',

    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT comunicados_condominio_fk
        FOREIGN KEY (condominio_id, cliente_id)
        REFERENCES admincond.condominios(id, cliente_id),

    CONSTRAINT comunicados_titulo_check
        CHECK (LENGTH(TRIM(titulo)) BETWEEN 1 AND 150),

    CONSTRAINT comunicados_contenido_check
        CHECK (LENGTH(TRIM(contenido)) BETWEEN 1 AND 5000),

    CONSTRAINT comunicados_estado_check
        CHECK (estado IN ('publicado', 'archivado'))
);

-- Consultas eficientes por condominio y fecha.
CREATE INDEX IF NOT EXISTS idx_comunicados_condominio_fecha
ON admincond.comunicados (
    condominio_id,
    creado_en DESC,
    id DESC
);

-- Busqueda de comunicados por autor.
CREATE INDEX IF NOT EXISTS idx_comunicados_autor
ON admincond.comunicados(autor_id);

RESET ROLE;

-- El backend puede consultar y publicar comunicados.
-- No permitimos eliminar registros desde la cuenta de la API.
GRANT SELECT, INSERT, UPDATE
ON admincond.comunicados
TO admincond_app;

GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA admincond
TO admincond_app;
