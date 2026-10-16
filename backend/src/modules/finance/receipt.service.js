
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { pool } from "../../database/pool.js";

const STORAGE_DIR = process.env.RECEIPTS_DIR || "/app/private_receipts";

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

const ALLOWED_TYPES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["application/pdf", ".pdf"],
]);

export async function uploadReceipt(userId, paymentId, file) {
  if (!file?.buffer?.length) {
    throw httpError(400, "Debes adjuntar un archivo");
  }

  const detected = await fileTypeFromBuffer(file.buffer);
  const extension = ALLOWED_TYPES.get(detected?.mime);

  if (!extension) {
    throw httpError(400, "Solo se permiten archivos JPG, PNG o PDF");
  }

  const originalName = path.basename(
    file.originalname.replaceAll("\\", "/")
  ).slice(0, 255);

  const storageKey = `${randomUUID()}${extension}`;
  const fullPath = path.join(STORAGE_DIR, storageKey);

  // El comprobante solo puede adjuntarse a un pago
  // pendiente registrado por el usuario autenticado.
  // Se comprueban también las membresías vigentes.
  const access = await pool.query(
    `SELECT 1
     FROM admincond.pagos p
     JOIN admincond.cuotas q
       ON q.id = p.cuota_id
      AND q.condominio_id = p.condominio_id
     JOIN admincond.unidades un
       ON un.id = q.unidad_id
      AND un.condominio_id = q.condominio_id
     JOIN admincond.condominios co
       ON co.id = q.condominio_id
     JOIN admincond.clientes cl
       ON cl.id = co.cliente_id
     JOIN admincond.relaciones_unidad r
       ON r.unidad_id = un.id
      AND r.condominio_id = co.id
     JOIN admincond.membresias_condominio mco
       ON mco.usuario_id = r.usuario_id
      AND mco.condominio_id = co.id
      AND mco.cliente_id = cl.id
     JOIN admincond.membresias_cliente mc
       ON mc.usuario_id = r.usuario_id
      AND mc.cliente_id = cl.id
     WHERE p.id = $1
       AND p.registrado_por = $2
       AND p.estado = 'pendiente'
       AND q.estado <> 'anulada'
       AND r.usuario_id = $2
       AND r.estado = 'activo'
       AND mco.estado = 'activo'
       AND mc.estado = 'activo'
       AND co.estado = 'activo'
       AND cl.estado = 'activo'`,
    [paymentId, userId]
  );

  if (!access.rowCount) {
    throw httpError(404, "Pago no encontrado o sin permiso");
  }

  await mkdir(STORAGE_DIR, { recursive: true });
  await writeFile(fullPath, file.buffer, { flag: "wx" });

  try {
    const result = await pool.query(
      `INSERT INTO admincond.comprobantes
         (pago_id, almacenamiento_clave, nombre_original,
          tipo_mime, tamano_bytes, subido_por)
       SELECT p.id, $3, $4, $5, $6, $2
       FROM admincond.pagos p
       WHERE p.id = $1
         AND p.registrado_por = $2
         AND p.estado = 'pendiente'
       RETURNING id, pago_id, nombre_original,
                 tipo_mime, tamano_bytes, creado_en`,
      [
        paymentId,
        userId,
        storageKey,
        originalName || "comprobante",
        detected.mime,
        file.buffer.length,
      ]
    );

    if (!result.rowCount) {
      throw httpError(409, "El pago ya no admite comprobantes");
    }

    return result.rows[0];
  } catch (error) {
    await unlink(fullPath).catch(() => {});
    throw error;
  }
}

export async function downloadReceipt(userId, receiptId) {
  const result = await pool.query(
    `SELECT cp.id, cp.nombre_original,
            cp.tipo_mime, cp.almacenamiento_clave
     FROM admincond.comprobantes cp
     JOIN admincond.pagos p
       ON p.id = cp.pago_id
     JOIN admincond.cuotas q
       ON q.id = p.cuota_id
      AND q.condominio_id = p.condominio_id
     JOIN admincond.condominios co
       ON co.id = q.condominio_id
     JOIN admincond.clientes cl
       ON cl.id = co.cliente_id
     WHERE cp.id = $2
       AND co.estado = 'activo'
       AND cl.estado = 'activo'
       AND (
         (
           p.registrado_por = $1
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
         )
         OR EXISTS (
           SELECT 1
           FROM admincond.permisos_financieros pf
           JOIN admincond.membresias_condominio mco
             ON mco.usuario_id = pf.usuario_id
            AND mco.condominio_id = pf.condominio_id
           JOIN admincond.membresias_cliente mc
             ON mc.usuario_id = mco.usuario_id
            AND mc.cliente_id = cl.id
           WHERE pf.usuario_id = $1
             AND pf.condominio_id = q.condominio_id
             AND pf.permiso = 'revisar_pagos'
             AND pf.estado = 'activo'
             AND mco.estado = 'activo'
             AND mc.estado = 'activo'
         )
       )`,
    [userId, receiptId]
  );

  if (!result.rowCount) {
    throw httpError(404, "Comprobante no encontrado");
  }

  const receipt = result.rows[0];

  // La clave proviene del servidor, no de una ruta enviada
  // libremente por el usuario.
  if (!/^[a-f0-9-]{36}\.(jpg|png|pdf)$/.test(
    receipt.almacenamiento_clave
  )) {
    throw httpError(500, "Referencia de archivo inválida");
  }

  const buffer = await readFile(
    path.join(STORAGE_DIR, receipt.almacenamiento_clave)
  );

  return { receipt, buffer };
}
