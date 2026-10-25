-- ADMINCOND - DÍA 34
-- Registrar cuándo comienza un intento de entrega.
-- No implica que el servidor SMTP haya aceptado el correo.

BEGIN;

SET LOCAL ROLE admincond_migrator;

ALTER TABLE admincond.invitaciones
ADD COLUMN IF NOT EXISTS inicio_envio_en TIMESTAMPTZ;

RESET ROLE;

COMMIT;
