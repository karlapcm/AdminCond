
-- ADMINCOND - DÍA 10
-- Asignación de administrador para pruebas locales.
-- No ejecutar en producción.

BEGIN;

DO $$
DECLARE
    admin_id BIGINT;
    cliente_a BIGINT;
    condominio_a BIGINT;
BEGIN
    SELECT id INTO admin_id
    FROM admincond.usuarios
    WHERE correo = 'admin.demo@admincond.test';

    SELECT id INTO cliente_a
    FROM admincond.clientes
    WHERE nombre = 'DEMO - Inmobiliaria Aurora';

    SELECT id INTO condominio_a
    FROM admincond.condominios
    WHERE cliente_id = cliente_a
      AND nombre = 'DEMO - Los Olivos';

    IF admin_id IS NULL
       OR cliente_a IS NULL
       OR condominio_a IS NULL THEN
        RAISE EXCEPTION
            'Faltan datos de prueba de los días anteriores';
    END IF;

    INSERT INTO admincond.membresias_cliente
        (usuario_id, cliente_id, rol, estado)
    VALUES
        (admin_id, cliente_a, 'colaborador', 'activo')
    ON CONFLICT (usuario_id, cliente_id)
    DO NOTHING;

    INSERT INTO admincond.membresias_condominio
        (usuario_id, cliente_id, condominio_id, rol, estado)
    VALUES
        (admin_id, cliente_a, condominio_a,
         'administrador', 'activo')
    ON CONFLICT (usuario_id, condominio_id)
    DO NOTHING;

    RAISE NOTICE 'Administrador ID: %', admin_id;
    RAISE NOTICE 'Condominio Los Olivos ID: %', condominio_a;
END $$;

COMMIT;
