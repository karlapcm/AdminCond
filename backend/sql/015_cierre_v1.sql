BEGIN;
SET LOCAL ROLE admincond_migrator;
CREATE TABLE admincond.administradores_plataforma (
 usuario_id BIGINT PRIMARY KEY REFERENCES admincond.usuarios(id),
 estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','revocado'))
);
CREATE FUNCTION admincond.bloquear_admin_plataforma(actor BIGINT) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,admincond AS $$
BEGIN
 PERFORM usuario_id FROM admincond.administradores_plataforma
 WHERE usuario_id=actor AND estado='activo' FOR SHARE;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION admincond.bloquear_admin_plataforma(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admincond.bloquear_admin_plataforma(BIGINT) TO admincond_app;
CREATE TABLE admincond.solicitudes_afiliacion (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 nombre VARCHAR(120) NOT NULL, correo VARCHAR(254) NOT NULL,
 cliente VARCHAR(150) NOT NULL, condominio VARCHAR(150) NOT NULL,
 direccion VARCHAR(250) NOT NULL,
 estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','rechazada')),
 motivo VARCHAR(500), creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 revisada_en TIMESTAMPTZ, revisado_por BIGINT REFERENCES admincond.usuarios(id),
 condominio_id BIGINT REFERENCES admincond.condominios(id)
);
CREATE UNIQUE INDEX afiliacion_pendiente ON admincond.solicitudes_afiliacion(LOWER(correo),LOWER(condominio)) WHERE estado='pendiente';
ALTER TABLE admincond.unidades ADD COLUMN piso VARCHAR(30);
ALTER TABLE admincond.relaciones_unidad ADD COLUMN acceso_financiero BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE admincond.areas_comunes ADD COLUMN normas VARCHAR(2000) NOT NULL DEFAULT '';
ALTER TABLE admincond.areas_comunes ADD COLUMN horario VARCHAR(500) NOT NULL DEFAULT '';
ALTER TABLE admincond.areas_comunes ADD COLUMN motivo_cierre VARCHAR(500);
CREATE TABLE admincond.publicaciones_publicas (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 condominio_id BIGINT NOT NULL REFERENCES admincond.condominios(id),
 titulo VARCHAR(150) NOT NULL, contenido VARCHAR(5000) NOT NULL,
 creada_por BIGINT NOT NULL REFERENCES admincond.usuarios(id),
 creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE admincond.juntas (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 condominio_id BIGINT NOT NULL REFERENCES admincond.condominios(id),
 titulo VARCHAR(150) NOT NULL, contenido VARCHAR(5000) NOT NULL,
 fecha TIMESTAMPTZ NOT NULL, creada_por BIGINT NOT NULL REFERENCES admincond.usuarios(id),
 creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE admincond.documentos (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 condominio_id BIGINT NOT NULL REFERENCES admincond.condominios(id),
 titulo VARCHAR(150) NOT NULL, nombre VARCHAR(255) NOT NULL,
 tipo_mime VARCHAR(100) NOT NULL CHECK (tipo_mime IN ('application/pdf','image/png','image/jpeg')),
 contenido BYTEA NOT NULL CHECK (octet_length(contenido) BETWEEN 1 AND 5242880),
 creada_por BIGINT NOT NULL REFERENCES admincond.usuarios(id),
 creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE admincond.auditoria (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tabla TEXT NOT NULL, registro_id TEXT NOT NULL, accion TEXT NOT NULL,
 usuario_id BIGINT, condominio_id BIGINT, creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
 ,cambios JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX auditoria_condominio_fecha ON admincond.auditoria(condominio_id,creada_en DESC);
CREATE FUNCTION admincond.registrar_auditoria() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,admincond AS $$
DECLARE dato jsonb; actor text;
BEGIN
 dato := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 actor := NULLIF(current_setting('admincond.actor',true),'');
 INSERT INTO admincond.auditoria(tabla,registro_id,accion,usuario_id,condominio_id,cambios)
 VALUES(TG_TABLE_NAME,COALESCE(dato->>'id',dato->>'usuario_id'),TG_OP,
 COALESCE(actor::bigint,(dato->>'revisado_por')::bigint,(dato->>'creada_por')::bigint,
 (dato->>'creado_por')::bigint,(dato->>'autor_id')::bigint,(dato->>'registrado_por')::bigint,(dato->>'subido_por')::bigint),
 (dato->>'condominio_id')::bigint,
 jsonb_build_object('actual',jsonb_strip_nulls(jsonb_build_object('estado',dato->'estado','rol',dato->'rol','permiso',dato->'permiso','es_principal',dato->'es_principal','responsable_pago',dato->'responsable_pago')),
 'anterior',CASE WHEN TG_OP='UPDATE' THEN jsonb_strip_nulls(jsonb_build_object('estado',to_jsonb(OLD)->'estado','rol',to_jsonb(OLD)->'rol','permiso',to_jsonb(OLD)->'permiso','es_principal',to_jsonb(OLD)->'es_principal','responsable_pago',to_jsonb(OLD)->'responsable_pago','acceso_financiero',to_jsonb(OLD)->'acceso_financiero')) ELSE NULL END));
 RETURN COALESCE(NEW,OLD);
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['administradores_plataforma','solicitudes_afiliacion','clientes','condominios','membresias_cliente','membresias_condominio','unidades','relaciones_unidad','permisos_financieros','cuotas','pagos','comprobantes','comunicados','invitaciones','recuperaciones_acceso','areas_comunes','juntas','documentos','publicaciones_publicas'] LOOP
 EXECUTE format('CREATE TRIGGER auditoria_cambios AFTER INSERT OR UPDATE OR DELETE ON admincond.%I FOR EACH ROW EXECUTE FUNCTION admincond.registrar_auditoria()',t);
 END LOOP;
END $$;
RESET ROLE;
GRANT SELECT ON admincond.administradores_plataforma,admincond.auditoria TO admincond_app;
GRANT SELECT,INSERT,UPDATE ON admincond.solicitudes_afiliacion,admincond.publicaciones_publicas,admincond.juntas,admincond.documentos TO admincond_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA admincond TO admincond_app;
COMMIT;
