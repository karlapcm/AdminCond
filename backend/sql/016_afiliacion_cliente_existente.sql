BEGIN;
SET LOCAL ROLE admincond_migrator;
ALTER TABLE admincond.solicitudes_afiliacion
ADD COLUMN cliente_id BIGINT REFERENCES admincond.clientes(id);
RESET ROLE;
COMMIT;
