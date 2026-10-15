
-- ADMINCOND - DÍA 8
-- Datos de demostración para desarrollo local.
-- NO ejecutar en producción.

BEGIN;

SET LOCAL ROLE admincond_migrator;

DO $$
DECLARE
    usuario_a BIGINT;
    usuario_b BIGINT;
    cliente_a BIGINT;
    cliente_b BIGINT;
    condominio_a BIGINT;
    condominio_b BIGINT;
BEGIN
    -- Buscar usuarios ya existentes
    SELECT id INTO usuario_a
    FROM admincond.usuarios
    WHERE correo = 'demo@admincond.test';

    SELECT id INTO usuario_b
    FROM admincond.usuarios
    WHERE correo = 'usuario.b@admincond.test';

    IF usuario_a IS NULL OR usuario_b IS NULL THEN
        RAISE EXCEPTION
            'Faltan usuarios de prueba. Crea ambos antes.';
    END IF;

    -- Crear o recuperar Cliente A
    SELECT id INTO cliente_a
    FROM admincond.clientes
    WHERE nombre = 'DEMO - Inmobiliaria Aurora'
    ORDER BY id
    LIMIT 1;

    IF cliente_a IS NULL THEN
        INSERT INTO admincond.clientes (nombre)
        VALUES ('DEMO - Inmobiliaria Aurora')
        RETURNING id INTO cliente_a;
    END IF;

    -- Crear o recuperar Cliente B
    SELECT id INTO cliente_b
    FROM admincond.clientes
    WHERE nombre = 'DEMO - Gestora del Sur'
    ORDER BY id
    LIMIT 1;

    IF cliente_b IS NULL THEN
        INSERT INTO admincond.clientes (nombre)
        VALUES ('DEMO - Gestora del Sur')
        RETURNING id INTO cliente_b;
    END IF;

    -- Crear condominio del Cliente A
    SELECT id INTO condominio_a
    FROM admincond.condominios
    WHERE cliente_id = cliente_a
      AND nombre = 'DEMO - Los Olivos'
    ORDER BY id
    LIMIT 1;

    IF condominio_a IS NULL THEN
        INSERT INTO admincond.condominios
            (cliente_id, nombre, direccion)
        VALUES
            (cliente_a, 'DEMO - Los Olivos',
             'Dirección ficticia A')
        RETURNING id INTO condominio_a;
    END IF;

    -- Crear condominio del Cliente B
    SELECT id INTO condominio_b
    FROM admincond.condominios
    WHERE cliente_id = cliente_b
      AND nombre = 'DEMO - Las Flores'
    ORDER BY id
    LIMIT 1;

    IF condominio_b IS NULL THEN
        INSERT INTO admincond.condominios
            (cliente_id, nombre, direccion)
        VALUES
            (cliente_b, 'DEMO - Las Flores',
             'Dirección ficticia B')
        RETURNING id INTO condominio_b;
    END IF;

    -- Usuario A pertenece exclusivamente al Cliente A
    INSERT INTO admincond.membresias_cliente
        (usuario_id, cliente_id, rol, estado)
    VALUES
        (usuario_a, cliente_a, 'supercliente', 'activo')
    ON CONFLICT (usuario_id, cliente_id)
    DO UPDATE SET
        rol = EXCLUDED.rol,
        estado = EXCLUDED.estado;

    -- Usuario B pertenece exclusivamente al Cliente B
    INSERT INTO admincond.membresias_cliente
        (usuario_id, cliente_id, rol, estado)
    VALUES
        (usuario_b, cliente_b, 'supercliente', 'activo')
    ON CONFLICT (usuario_id, cliente_id)
    DO UPDATE SET
        rol = EXCLUDED.rol,
        estado = EXCLUDED.estado;

    RAISE NOTICE 'Cliente A ID: %, Condominio A ID: %',
        cliente_a, condominio_a;

    RAISE NOTICE 'Cliente B ID: %, Condominio B ID: %',
        cliente_b, condominio_b;
END $$;

COMMIT;
