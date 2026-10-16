
-- Solo para desarrollo local.
-- Simula un permiso concedido por el Supercliente A.

BEGIN;

INSERT INTO admincond.permisos_financieros (
    usuario_id,
    condominio_id,
    permiso,
    otorgado_por
)
SELECT
    admin.id,
    co.id,
    'crear_cuotas',
    supercliente.id
FROM admincond.usuarios admin
CROSS JOIN admincond.usuarios supercliente
JOIN admincond.membresias_cliente mc
    ON mc.usuario_id = supercliente.id
JOIN admincond.condominios co
    ON co.cliente_id = mc.cliente_id
JOIN admincond.membresias_condominio mco
    ON mco.usuario_id = admin.id
   AND mco.condominio_id = co.id
   AND mco.cliente_id = co.cliente_id
WHERE admin.correo = 'admin.demo@admincond.test'
  AND supercliente.correo = 'demo@admincond.test'
  AND co.nombre = 'DEMO - Los Olivos'
  AND mc.rol = 'supercliente'
  AND mc.estado = 'activo'
  AND mco.rol = 'administrador'
  AND mco.estado = 'activo'
ON CONFLICT (usuario_id, condominio_id, permiso)
DO NOTHING;


-- Permiso de revisión para el administrador demo.
-- Solo para desarrollo local.

INSERT INTO admincond.permisos_financieros (
    usuario_id,
    condominio_id,
    permiso,
    otorgado_por
)
SELECT
    adm.id,
    co.id,
    'revisar_pagos',
    sc.id
FROM admincond.usuarios adm
JOIN admincond.membresias_condominio mco
    ON mco.usuario_id = adm.id
JOIN admincond.condominios co
    ON co.id = mco.condominio_id
JOIN admincond.usuarios sc
    ON sc.correo = 'demo@admincond.test'
JOIN admincond.membresias_cliente mc
    ON mc.usuario_id = sc.id
   AND mc.cliente_id = co.cliente_id
WHERE adm.correo = 'admin.demo@admincond.test'
  AND co.nombre = 'DEMO - Los Olivos'
  AND mco.rol = 'administrador'
  AND mco.estado = 'activo'
  AND mc.rol = 'supercliente'
  AND mc.estado = 'activo'
ON CONFLICT (usuario_id, condominio_id, permiso)
DO NOTHING;

COMMIT;
