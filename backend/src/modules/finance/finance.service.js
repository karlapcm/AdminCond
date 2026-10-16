
import { pool } from "../../database/pool.js";

function errorHttp(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function transaction(callback) {
  const db = await pool.connect();

  try {
    await db.query("BEGIN");
    const result = await callback(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}

// El residente reporta un pago de su propia unidad.
export async function reportPayment(userId, cuotaId, monto, referencia) {
  return transaction(async (db) => {
    const fee = await db.query(
      `SELECT q.id, q.condominio_id, q.monto
       FROM admincond.cuotas q
       JOIN admincond.unidades un
         ON un.id = q.unidad_id
        AND un.condominio_id = q.condominio_id
       JOIN admincond.condominios co
         ON co.id = q.condominio_id
       JOIN admincond.clientes cl
         ON cl.id = co.cliente_id
       WHERE q.id = $2
         AND q.estado <> 'anulada'
         AND un.estado = 'activa'
         AND co.estado = 'activo'
         AND cl.estado = 'activo'
         AND EXISTS (
           SELECT 1
           FROM admincond.relaciones_unidad r
           JOIN admincond.membresias_condominio mco
             ON mco.usuario_id = r.usuario_id
            AND mco.condominio_id = r.condominio_id
            AND mco.cliente_id = cl.id
           JOIN admincond.membresias_cliente mc
             ON mc.usuario_id = r.usuario_id
            AND mc.cliente_id = cl.id
           WHERE r.usuario_id = $1
             AND r.unidad_id = q.unidad_id
             AND r.condominio_id = q.condominio_id
             AND r.estado = 'activo'
             AND mco.estado = 'activo'
             AND mc.estado = 'activo'
         )
       FOR UPDATE OF q`,
      [userId, cuotaId]
    );

    if (!fee.rowCount) {
      throw errorHttp(404, "Cuota no encontrada o sin acceso");
    }

    const balance = await db.query(
      `SELECT q.monto -
          COALESCE(SUM(p.monto) FILTER (
            WHERE p.estado = 'aprobado'
          ), 0) AS saldo
       FROM admincond.cuotas q
       LEFT JOIN admincond.pagos p
         ON p.cuota_id = q.id
       WHERE q.id = $1
       GROUP BY q.id`,
      [cuotaId]
    );

    const saldo = balance.rows[0].saldo;

    const check = await db.query(
      `SELECT $1::numeric <= $2::numeric AS valido`,
      [monto, saldo]
    );

    if (!check.rows[0].valido) {
      throw errorHttp(409, "El pago supera el saldo disponible");
    }

    const result = await db.query(
      `INSERT INTO admincond.pagos
         (cuota_id, condominio_id, monto,
          referencia, registrado_por)
       VALUES ($1, $2, $3::numeric, $4, $5)
       RETURNING id, cuota_id, monto, referencia,
                 estado, registrado_en`,
      [
        cuotaId,
        fee.rows[0].condominio_id,
        monto,
        referencia,
        userId,
      ]
    );

    return result.rows[0];
  });
}

// Personal con permiso financiero revisa pagos pendientes.
export async function pendingPayments(userId) {
  const result = await pool.query(
    `SELECT p.id, p.cuota_id, p.monto,
            p.referencia, p.registrado_en,
            q.concepto, un.codigo AS unidad
     FROM admincond.pagos p
     JOIN admincond.cuotas q
       ON q.id = p.cuota_id
       AND q.condominio_id = p.condominio_id
     JOIN admincond.unidades un
       ON un.id = q.unidad_id
     JOIN admincond.condominios co
       ON co.id = p.condominio_id
     JOIN admincond.clientes cl
       ON cl.id = co.cliente_id
     WHERE p.estado = 'pendiente'
       AND q.estado <> 'anulada'
       AND co.estado = 'activo'
       AND cl.estado = 'activo'
       AND EXISTS (
         SELECT 1
         FROM admincond.permisos_financieros pf
         JOIN admincond.membresias_condominio mco
           ON mco.usuario_id = pf.usuario_id
          AND mco.condominio_id = pf.condominio_id
         JOIN admincond.membresias_cliente mc
           ON mc.usuario_id = mco.usuario_id
          AND mc.cliente_id = cl.id
         WHERE pf.usuario_id = $1
           AND pf.condominio_id = co.id
           AND pf.permiso = 'revisar_pagos'
           AND pf.estado = 'activo'
           AND mco.estado = 'activo'
           AND mc.estado = 'activo'
       )
     ORDER BY p.registrado_en`,
    [userId]
  );

  return result.rows;
}

// Aprobar o rechazar dentro de una transacción.
export async function reviewPayment(userId, pagoId, decision) {
  return transaction(async (db) => {
    // Bloqueamos primero la cuota para serializar
    // todas las revisiones que afectan su saldo.
    const fee = await db.query(
      `SELECT q.id, q.monto, q.estado,
              q.condominio_id, co.cliente_id
       FROM admincond.pagos p
       JOIN admincond.cuotas q
         ON q.id = p.cuota_id
        AND q.condominio_id = p.condominio_id
       JOIN admincond.condominios co
         ON co.id = q.condominio_id
       JOIN admincond.clientes cl
         ON cl.id = co.cliente_id
       WHERE p.id = $1
         AND co.estado = 'activo'
         AND cl.estado = 'activo'
       FOR UPDATE OF q`,
      [pagoId]
    );

    if (!fee.rowCount) {
      throw errorHttp(404, "Pago no encontrado");
    }

    const cuota = fee.rows[0];

    // Validamos el permiso vigente en PostgreSQL.
    // Bloquear esta fila impide que una revocación
    // concurrente se adelante a la revisión.
    const permission = await db.query(
      `SELECT pf.id
       FROM admincond.permisos_financieros pf
       JOIN admincond.membresias_condominio mco
         ON mco.usuario_id = pf.usuario_id
        AND mco.condominio_id = pf.condominio_id
       JOIN admincond.membresias_cliente mc
         ON mc.usuario_id = mco.usuario_id
        AND mc.cliente_id = $3
       WHERE pf.usuario_id = $1
         AND pf.condominio_id = $2
         AND pf.permiso = 'revisar_pagos'
         AND pf.estado = 'activo'
         AND mco.estado = 'activo'
         AND mc.estado = 'activo'
       FOR SHARE OF pf`,
      [userId, cuota.condominio_id, cuota.cliente_id]
    );

    if (!permission.rowCount) {
      throw errorHttp(404, "Pago no encontrado o sin permiso");
    }

    const payment = await db.query(
      `SELECT id, monto, registrado_por, estado
       FROM admincond.pagos
       WHERE id = $1
         AND cuota_id = $2
       FOR UPDATE`,
      [pagoId, cuota.id]
    );

    const pago = payment.rows[0];

    if (!pago || pago.estado !== "pendiente") {
      throw errorHttp(409, "Este pago ya fue revisado");
    }

    if (String(pago.registrado_por) === String(userId)) {
      throw errorHttp(403, "No puedes revisar tu propio pago");
    }

    if (cuota.estado === "anulada") {
      throw errorHttp(409, "La cuota está anulada");
    }

    const nuevoEstado =
      decision === "aprobar" ? "aprobado" : "rechazado";

    if (decision === "aprobar") {
      // PostgreSQL calcula con NUMERIC, sin
      // operaciones monetarias en coma flotante.
      const result = await db.query(
        `SELECT
           $2::numeric -
           COALESCE(SUM(monto), 0) AS saldo
         FROM admincond.pagos
         WHERE cuota_id = $1
           AND estado = 'aprobado'`,
        [cuota.id, cuota.monto]
      );

      const saldo = result.rows[0].saldo;

      const check = await db.query(
        `SELECT $1::numeric <= $2::numeric AS valido`,
        [pago.monto, saldo]
      );

      if (!check.rows[0].valido) {
        throw errorHttp(409, "El pago supera el saldo de la cuota");
      }
    }

    await db.query(
      `UPDATE admincond.pagos
       SET estado = $1,
           revisado_por = $2,
           revisado_en = NOW()
       WHERE id = $3`,
      [nuevoEstado, userId, pagoId]
    );

    // El saldo solo considera pagos aprobados.
    const balance = await db.query(
      `SELECT q.monto -
           COALESCE(SUM(p.monto) FILTER (
             WHERE p.estado = 'aprobado'
           ), 0) AS saldo
       FROM admincond.cuotas q
       LEFT JOIN admincond.pagos p
         ON p.cuota_id = q.id
       WHERE q.id = $1
       GROUP BY q.id`,
      [cuota.id]
    );

    const saldo = balance.rows[0].saldo;

    await db.query(
      `UPDATE admincond.cuotas
       SET estado = CASE
         WHEN $2::numeric = 0 THEN 'pagada'
         WHEN $2::numeric < monto THEN 'parcial'
         ELSE 'pendiente'
       END
       WHERE id = $1`,
      [cuota.id, saldo]
    );

    return {
      pagoId,
      estado: nuevoEstado,
      cuotaId: cuota.id,
      saldo,
    };
  });
}
