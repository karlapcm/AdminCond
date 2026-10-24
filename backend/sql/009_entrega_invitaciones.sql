
-- ADMINCOND - DÍA 31
-- Seguimiento del envío de invitaciones.
-- No almacena tokens originales ni credenciales SMTP.

BEGIN;

SET LOCAL ROLE admincond_migrator;

ALTER TABLE admincond.invitaciones
  ADD COLUMN IF NOT EXISTS estado_entrega
    VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS intentos_entrega
    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_intento_en
    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enviado_en
    TIMESTAMPTZ;

ALTER TABLE admincond.invitaciones
  ADD CONSTRAINT invitaciones_entrega_estado_check
  CHECK (
    estado_entrega IN (
      'pendiente',
      'enviado',
      'fallido'
    )
  );

ALTER TABLE admincond.invitaciones
  ADD CONSTRAINT invitaciones_entrega_intentos_check
  CHECK (intentos_entrega >= 0);

ALTER TABLE admincond.invitaciones
  ADD CONSTRAINT invitaciones_entrega_enviado_check
  CHECK (
    (estado_entrega = 'enviado' AND enviado_en IS NOT NULL)
    OR
    (estado_entrega <> 'enviado' AND enviado_en IS NULL)
  );

RESET ROLE;

COMMIT;
