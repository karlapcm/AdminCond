-- ADMINCOND - DÍA 34
-- Seguimiento de recuperaciones administrativas.
-- No almacena tokens originales ni credenciales.

BEGIN;

SET LOCAL ROLE admincond_migrator;

ALTER TABLE admincond.invitaciones
ADD COLUMN IF NOT EXISTS recuperacion_iniciada_en TIMESTAMPTZ;

RESET ROLE;

COMMIT;
