
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { pool } from "../../database/pool.js";

const RECOVERY_MINUTES = 30;

/**
 * Crea una solicitud de recuperación únicamente
 * cuando existe una cuenta activa.
 *
 * Esta función es interna: el token original nunca
 * debe guardarse en PostgreSQL ni enviarse al navegador.
 */
export async function createAccessRecovery(
  correo,
  { query = pool.query.bind(pool) } = {}
) {
  const token = randomBytes(32).toString("base64url");

  const tokenHash = createHash("sha256")
    .update(token)
    .digest("hex");

  const result = await query(
    `WITH cuenta_autorizada AS (
      UPDATE admincond.usuarios
      SET ultima_recuperacion_solicitada_en = NOW()
      WHERE LOWER(correo) = LOWER($3)
        AND estado = 'activo'
        AND (
          ultima_recuperacion_solicitada_en IS NULL
          OR ultima_recuperacion_solicitada_en
            <= NOW() - INTERVAL '15 minutes'
        )
      RETURNING id
    )
    INSERT INTO admincond.recuperaciones_acceso (
      id,
      usuario_id,
      token_hash,
      expira_en
    )
    SELECT
      $1,
      id,
      $2,
      NOW() + INTERVAL '30 minutes'
    FROM cuenta_autorizada
    RETURNING id, usuario_id`,
    [randomUUID(), tokenHash, correo.trim()]
  );

  if (result.rowCount !== 1) {
    return null;
  }

  // Utilizamos el usuario identificado por PostgreSQL,
  // no una dirección proporcionada directamente
  // por el solicitante para la entrega.
  const userResult = await query(
    `SELECT correo
     FROM admincond.usuarios
     WHERE id = $1
       AND estado = 'activo'`,
    [result.rows[0].usuario_id]
  );

  if (userResult.rowCount !== 1) {
    return null;
  }

  return {
    recoveryId: result.rows[0].id,
    to: userResult.rows[0].correo,
    token,
    expiresInMinutes: RECOVERY_MINUTES,
  };
}
