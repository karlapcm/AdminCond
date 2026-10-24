
import { pool } from "../../database/pool.js";

/**
 * Reclama una invitación pendiente antes de enviarla.
 *
 * El UPDATE condicional es atómico:
 * solamente un proceso puede cambiar
 * pendiente -> enviando.
 *
 * No envía correos ni recupera tokens.
 */
export async function claimInvitationDelivery(
  invitationId,
  { query = pool.query.bind(pool) } = {}
) {
  const result = await query(
    `UPDATE admincond.invitaciones
     SET estado_entrega = 'enviando'
     WHERE id = $1
       AND estado = 'pendiente'
       AND expira_en > NOW()
       AND estado_entrega = 'pendiente'
     RETURNING id, estado_entrega`,
    [invitationId]
  );

  if (result.rowCount !== 1) {
    return null;
  }

  return result.rows[0];
}

/**
 * Registra el resultado de un intento de envío.
 *
 * accepted = true: SMTP aceptó el mensaje.
 * accepted = false: el intento falló.
 *
 * No almacena tokens ni mensajes de error SMTP.
 */
export async function recordInvitationDelivery(
  invitationId,
  accepted,
  { query = pool.query.bind(pool) } = {}
) {
  const result = await query(
    `UPDATE admincond.invitaciones
     SET
       estado_entrega = CASE
         WHEN $2::boolean THEN 'enviado'
         ELSE 'fallido'
       END,
       intentos_entrega = intentos_entrega + 1,
       ultimo_intento_en = NOW(),
       enviado_en = CASE
         WHEN $2::boolean THEN NOW()
         ELSE NULL
       END
     WHERE id = $1
       AND estado = 'pendiente'
       AND estado_entrega = 'enviando'
     RETURNING
       id,
       estado_entrega,
       intentos_entrega`,
    [invitationId, accepted]
  );

  if (result.rowCount !== 1) {
    throw new Error(
      "Invitación no disponible para registrar entrega"
    );
  }

  return result.rows[0];
}
