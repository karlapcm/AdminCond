
-- ADMINCOND V1 - DÍA 36
-- Límite de recuperación por cuenta.
--
-- No almacena tokens ni contraseñas.
-- Permite controlar solicitudes simultáneas.

BEGIN;

SET LOCAL ROLE admincond_migrator;

ALTER TABLE admincond.usuarios
ADD COLUMN IF NOT EXISTS ultima_recuperacion_solicitada_en
TIMESTAMPTZ;

RESET ROLE;

COMMIT;
