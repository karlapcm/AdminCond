
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
     SET estado_entrega = 'enviando',
        inicio_envio_en = NOW()
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

/**
 * Diagnóstico de entregas y recuperaciones
 * posiblemente interrumpidas.
 *
 * Requiere membresía administrativa activa.
 * No modifica estados, no recupera tokens
 * ni realiza envíos automáticos.
 */
export async function findPossiblyInterruptedDeliveries(
  userId,
  { query = pool.query.bind(pool) } = {}
) {
  const result = await query(
    `SELECT
       i.id,
       s.condominio_id,
       i.estado_entrega,
       i.inicio_envio_en,
       i.recuperacion_iniciada_en,
       CASE
         WHEN i.estado_entrega = 'enviando'
           THEN 'envio_incierto'
         ELSE 'recuperacion_pendiente'
       END AS tipo_incidencia
     FROM admincond.invitaciones i
     JOIN admincond.solicitudes_residentes s
       ON s.id = i.solicitud_id
     JOIN admincond.unidades u
       ON u.id = s.unidad_id
      AND u.condominio_id = s.condominio_id
     JOIN admincond.condominios co
       ON co.id = s.condominio_id
     JOIN admincond.clientes c
       ON c.id = co.cliente_id
     WHERE i.estado = 'pendiente'
       AND s.estado = 'aprobada'
       AND u.estado = 'activa'
       AND co.estado = 'activo'
       AND c.estado = 'activo'
       AND (
         (
           i.estado_entrega = 'enviando'
           AND (
             (
               i.inicio_envio_en IS NOT NULL
               AND i.inicio_envio_en <=
                 NOW() - INTERVAL '30 minutes'
             )
             OR
             (
               i.inicio_envio_en IS NULL
               AND i.creada_en <=
                 NOW() - INTERVAL '30 minutes'
             )
           )
         )
         OR
         (
           i.estado_entrega = 'pendiente'
           AND i.recuperacion_iniciada_en IS NOT NULL
           AND i.recuperacion_iniciada_en <=
             NOW() - INTERVAL '30 minutes'
         )
       )
       AND EXISTS (
         SELECT 1
         FROM admincond.membresias_condominio mco
         JOIN admincond.membresias_cliente mc
           ON mc.usuario_id = mco.usuario_id
          AND mc.cliente_id = mco.cliente_id
         JOIN admincond.usuarios usuario
           ON usuario.id = mco.usuario_id
         WHERE mco.usuario_id = $1
           AND mco.condominio_id = co.id
           AND mco.cliente_id = c.id
           AND mco.rol = 'administrador'
           AND mco.estado = 'activo'
           AND mc.estado = 'activo'
           AND usuario.estado = 'activo'
       )
     ORDER BY
       COALESCE(
         i.inicio_envio_en,
         i.recuperacion_iniciada_en,
         i.creada_en
       ) ASC,
       i.id ASC`,
    [userId]
  );

  return result.rows;
}
