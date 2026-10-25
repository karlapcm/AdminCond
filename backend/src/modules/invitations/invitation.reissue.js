
import { randomBytes, createHash } from "node:crypto";
import { pool } from "../../database/pool.js";

const INVITATION_HOURS = 48;

/**
 * Reemite una invitación después de un fallo registrado.
 *
 * Requiere un administrador autorizado del condominio.
 * Genera un token nuevo e invalida el anterior.
 *
 * No envía correos ni registra tokens en logs.
 * No habilita reintentos automáticos.
 */
export async function reissueFailedInvitation(
  administratorId,
  invitationId,
  { query = pool.query.bind(pool) } = {}
) {
  const token = randomBytes(32).toString("base64url");

  const tokenHash = createHash("sha256")
    .update(token)
    .digest("hex");

  const result = await query(
    `UPDATE admincond.invitaciones i
     SET token_hash = $3,
         estado_entrega = 'pendiente',
         expira_en = NOW() + INTERVAL '48 hours',
         enviado_en = NULL
     FROM admincond.solicitudes_residentes s
     JOIN admincond.condominios co
       ON co.id = s.condominio_id
     JOIN admincond.clientes c
       ON c.id = co.cliente_id
     JOIN admincond.unidades u
       ON u.id = s.unidad_id
      AND u.condominio_id = co.id
     JOIN admincond.membresias_condominio mco
       ON mco.condominio_id = co.id
      AND mco.cliente_id = c.id
     JOIN admincond.membresias_cliente mc
       ON mc.usuario_id = mco.usuario_id
      AND mc.cliente_id = c.id
     WHERE i.solicitud_id = s.id
       AND i.id = $1
       AND mco.usuario_id = $2
       AND mco.rol = 'administrador'
       AND mco.estado = 'activo'
       AND mc.estado = 'activo'
       AND co.estado = 'activo'
       AND c.estado = 'activo'
       AND u.estado = 'activa'
       AND s.estado = 'aprobada'
       AND i.estado = 'pendiente'
       AND i.estado_entrega = 'fallido'
     RETURNING i.id, i.correo_destino, i.expira_en`,
    [invitationId, administratorId, tokenHash]
  );

  if (result.rowCount !== 1) {
    return null;
  }

  return {
    invitationId: result.rows[0].id,
    to: result.rows[0].correo_destino,
    token,
    expiresInHours: INVITATION_HOURS,
  };
}

/**
 * Recuperación explícita de una invitación cuyo envío
 * pudo quedar interrumpido.
 *
 * IMPORTANTE:
 * - No demuestra que SMTP haya fallado.
 * - No envía correos.
 * - No ejecuta reintentos automáticos.
 * - Rota el token de manera atómica.
 * - Solo permite al administrador autorizado recuperar
 *   entregas antiguas (30 minutos como mínimo).
 *
 * La ruta HTTP deberá exigir confirmación explícita.
 */
export async function recoverInterruptedInvitation(
  administratorId,
  invitationId,
  { query = pool.query.bind(pool) } = {}
) {
  const token = randomBytes(32).toString("base64url");

  const tokenHash = createHash("sha256")
    .update(token)
    .digest("hex");

  const result = await query(
    `UPDATE admincond.invitaciones i
     SET token_hash = $3,
         estado_entrega = 'pendiente',
         inicio_envio_en = NULL,
         recuperacion_iniciada_en = NOW(),
         expira_en = NOW() + INTERVAL '48 hours',
         enviado_en = NULL
     FROM admincond.solicitudes_residentes s
     JOIN admincond.unidades u
       ON u.id = s.unidad_id
      AND u.condominio_id = s.condominio_id
     JOIN admincond.condominios co
       ON co.id = s.condominio_id
     JOIN admincond.clientes c
       ON c.id = co.cliente_id
     WHERE i.id = $1
       AND i.solicitud_id = s.id
       AND i.estado = 'pendiente'
       AND s.estado = 'aprobada'

       AND (
         -- Caso 1: envío interrumpido o resultado incierto.
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

         -- Caso 2: recuperación previa interrumpida.
         (
           i.estado_entrega = 'pendiente'
           AND i.recuperacion_iniciada_en IS NOT NULL
           AND i.recuperacion_iniciada_en <=
             NOW() - INTERVAL '30 minutes'
         )
       )

       AND u.estado = 'activa'
       AND co.estado = 'activo'
       AND c.estado = 'activo'
       AND EXISTS (
         SELECT 1
         FROM admincond.membresias_condominio mco
         JOIN admincond.membresias_cliente mc
           ON mc.usuario_id = mco.usuario_id
          AND mc.cliente_id = mco.cliente_id
         JOIN admincond.usuarios usuario
           ON usuario.id = mco.usuario_id
         WHERE mco.usuario_id = $2
           AND mco.condominio_id = co.id
           AND mco.cliente_id = c.id
           AND mco.rol = 'administrador'
           AND mco.estado = 'activo'
           AND mc.estado = 'activo'
           AND usuario.estado = 'activo'
       )
     RETURNING i.id, i.correo_destino`,
    [invitationId, administratorId, tokenHash]
  );

  if (result.rowCount !== 1) {
    return null;
  }

  return {
    invitationId: result.rows[0].id,
    to: result.rows[0].correo_destino,
    token,
    expiresInHours: 48,
  };
}
