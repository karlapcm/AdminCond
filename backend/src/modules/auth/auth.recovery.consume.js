
import { createHash } from "node:crypto";
import argon2 from "argon2";
import { pool } from "../../database/pool.js";

/**
 * Cambia la contraseña mediante un token de recuperación.
 *
 * Todas las modificaciones ocurren en una transacción.
 * No devuelve datos personales ni tokens.
 *
 * El cliente debe estar conectado a la base correcta.
 */
export async function consumeAccessRecovery(
  token,
  newPassword,
  { connect = () => pool.connect() } = {}
) {
  if (
    typeof token !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(token) ||
    typeof newPassword !== "string" ||
    newPassword.length < 12 ||
    newPassword.length > 128
  ) {
    return false;
  }

  const tokenHash = createHash("sha256")
    .update(token)
    .digest("hex");

  // Calcular Argon2 antes de abrir la transacción
  // evita mantener bloqueos durante el hashing.
  const newPasswordHash = await argon2.hash(newPassword);

  const client = await connect();

  try {

    await client.query("BEGIN");

    // 1. Identificar al propietario del token.
    // Esta consulta no bloquea todavía registros.
    const candidate = await client.query(
        `SELECT usuario_id
        FROM admincond.recuperaciones_acceso
        WHERE token_hash = $1`,
      [tokenHash]
    );

    if (candidate.rowCount !== 1) {
      await client.query("ROLLBACK");
      return false;
    }

    const userId = candidate.rows[0].usuario_id;
    await client.query("SELECT set_config('admincond.actor',$1,true)",[String(userId)]);

    // 2. Bloquear primero la cuenta.
    // Así todas las recuperaciones de un mismo usuario
    // siguen un único orden de bloqueo.
    const user = await client.query(
        `SELECT id
        FROM admincond.usuarios
        WHERE id = $1
            AND estado = 'activo'
        FOR UPDATE`,
        [userId]
    );

    if (user.rowCount !== 1) {
        await client.query("ROLLBACK");
        return false;
    }

    // 3. Validar nuevamente el token DESPUÉS de
    // obtener el bloqueo del usuario.
    //
    // Otra transacción podría haberlo consumido
    // mientras esperábamos el bloqueo anterior.
    const recovery = await client.query(
        `SELECT id
        FROM admincond.recuperaciones_acceso
        WHERE token_hash = $1
            AND usuario_id = $2
            AND consumido_en IS NULL
            AND expira_en > NOW()
        FOR UPDATE`,
        [tokenHash, userId]
    );

    if (recovery.rowCount !== 1) {
        await client.query("ROLLBACK");
        return false;
    }

    await client.query(
      `UPDATE admincond.usuarios
       SET password_hash = $2
       WHERE id = $1`,
      [userId, newPasswordHash]
    );

    // Invalidar todas las recuperaciones
    // pendientes de esta cuenta.
    await client.query(
      `UPDATE admincond.recuperaciones_acceso
       SET consumido_en = NOW()
       WHERE usuario_id = $1
         AND consumido_en IS NULL`,
      [userId]
    );

    // Revocar todas las sesiones activas, incluidos
    // refresh tokens y JWT asociados a esas sesiones.
    await client.query(
      `UPDATE admincond.sesiones
       SET revocada_en = NOW()
       WHERE usuario_id = $1
         AND revocada_en IS NULL`,
      [userId]
    );

    await client.query("COMMIT");

    return true;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Conservamos el error original.
    }

    throw error;
  } finally {
    client.release();
  }
}
