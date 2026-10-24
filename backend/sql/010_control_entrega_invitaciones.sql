-- ADMINCOND - DÍA 31
-- Permitir el estado intermedio de entrega.

BEGIN;

SET LOCAL ROLE admincond_migrator;

ALTER TABLE admincond.invitaciones
DROP CONSTRAINT invitaciones_entrega_estado_check;

ALTER TABLE admincond.invitaciones
ADD CONSTRAINT invitaciones_entrega_estado_check
CHECK (
  estado_entrega IN (
    'pendiente',
    'enviando',
    'enviado',
    'fallido'
  )
);

RESET ROLE;

COMMIT;
