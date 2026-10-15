
-- ADMINCOND - DÍA 9
-- Datos ficticios para pruebas locales.
-- No ejecutar en producción.

BEGIN;

DO $$
DECLARE
  usuario_a BIGINT;
  usuario_b BIGINT;
  cliente_a BIGINT;
  cliente_b BIGINT;
  condominio_a BIGINT;
  condominio_b BIGINT;
  unidad_a BIGINT;
  unidad_b BIGINT;
BEGIN
  SELECT id INTO usuario_a
  FROM admincond.usuarios
  WHERE correo = 'demo@admincond.test';

  SELECT id INTO usuario_b
  FROM admincond.usuarios
  WHERE correo = 'usuario.b@admincond.test';

  SELECT id INTO cliente_a
  FROM admincond.clientes
  WHERE nombre = 'DEMO - Inmobiliaria Aurora';

  SELECT id INTO cliente_b
  FROM admincond.clientes
  WHERE nombre = 'DEMO - Gestora del Sur';

  SELECT id INTO condominio_a
  FROM admincond.condominios
  WHERE cliente_id = cliente_a
    AND nombre = 'DEMO - Los Olivos';

  SELECT id INTO condominio_b
  FROM admincond.condominios
  WHERE cliente_id = cliente_b
    AND nombre = 'DEMO - Las Flores';

  IF usuario_a IS NULL OR usuario_b IS NULL
     OR cliente_a IS NULL OR cliente_b IS NULL
     OR condominio_a IS NULL OR condominio_b IS NULL THEN
    RAISE EXCEPTION 'Faltan datos del Día 8';
  END IF;

  -- Creamos viviendas dentro de cada condominio.
  INSERT INTO admincond.unidades
    (condominio_id, codigo, tipo)
  VALUES
    (condominio_a, 'CASA-DEMO-A', 'casa')
  ON CONFLICT (condominio_id, codigo)
  DO NOTHING;

  INSERT INTO admincond.unidades
    (condominio_id, codigo, tipo)
  VALUES
    (condominio_b, 'DEP-DEMO-B', 'departamento')
  ON CONFLICT (condominio_id, codigo)
  DO NOTHING;

  SELECT id INTO unidad_a
  FROM admincond.unidades
  WHERE condominio_id = condominio_a
    AND codigo = 'CASA-DEMO-A';

  SELECT id INTO unidad_b
  FROM admincond.unidades
  WHERE condominio_id = condominio_b
    AND codigo = 'DEP-DEMO-B';

  -- Asignaciones ficticias para probar /mine.
  INSERT INTO admincond.membresias_condominio
    (usuario_id, cliente_id, condominio_id, rol, estado)
  VALUES
    (usuario_a, cliente_a, condominio_a, 'residente', 'activo'),
    (usuario_b, cliente_b, condominio_b, 'residente', 'activo')
  ON CONFLICT (usuario_id, condominio_id)
  DO UPDATE SET estado = 'activo';

  -- Cada usuario es principal de su propia unidad.
  INSERT INTO admincond.relaciones_unidad
    (usuario_id, condominio_id, unidad_id,
     es_ocupante, es_principal, estado)
  VALUES
    (usuario_a, condominio_a, unidad_a,
     TRUE, TRUE, 'activo'),
    (usuario_b, condominio_b, unidad_b,
     TRUE, TRUE, 'activo')
  ON CONFLICT (usuario_id, unidad_id)
  DO UPDATE SET
    es_ocupante = TRUE,
    es_principal = TRUE,
    estado = 'activo';

  RAISE NOTICE 'Unidad A ID: %', unidad_a;
  RAISE NOTICE 'Unidad B ID: %', unidad_b;
END $$;

COMMIT;
