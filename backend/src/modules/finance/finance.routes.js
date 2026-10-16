import { Router } from "express";
import { z } from "zod";

import { pool } from "../../database/pool.js";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  reportPayment,
  pendingPayments,
  reviewPayment,
} from "./finance.service.js";

export const financeRouter = Router();

financeRouter.use(requireAuth);

const positiveId = z.coerce.number().int().positive().safe();

const createFeeSchema = z.object({
  unidadId: positiveId,
  concepto: z.string().trim().min(3).max(200),
  periodo: z.iso.date(),
  monto: z.string().regex(/^(?:0|[1-9]\d{0,9})\.\d{2}$/),
  vencimiento: z.iso.date(),
});

const paymentSchema = z.object({
  cuotaId: positiveId,
  monto: z.string().regex(/^(?:0|[1-9]\d{0,9})\.\d{2}$/),
  referencia: z.string().trim().max(150).optional(),
});

const reviewSchema = z.object({
  decision: z.enum(["aprobar", "rechazar"]),
});

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// POST /api/finance/fees
// Crear una cuota solo con permiso financiero activo.
financeRouter.post(
  "/fees",
  asyncHandler(async (req, res) => {
    const parsed = createFeeSchema.safeParse(req.body);

    if (!parsed.success || Number(parsed.data?.monto) <= 0) {
      return res.status(400).json({
        message: "Datos de cuota inválidos",
      });
    }

    const data = parsed.data;

    // La autorización y la inserción ocurren
    // en una misma instrucción SQL.
    const result = await pool.query(
      `INSERT INTO admincond.cuotas (
         condominio_id,
         unidad_id,
         concepto,
         periodo,
         monto,
         vencimiento,
         creada_por
       )
       SELECT
         un.condominio_id,
         un.id,
         $3,
         $4::date,
         $5::numeric,
         $6::date,
         $1
       FROM admincond.unidades un
       JOIN admincond.condominios co
         ON co.id = un.condominio_id
       JOIN admincond.clientes cl
         ON cl.id = co.cliente_id
       WHERE un.id = $2
         AND un.estado = 'activa'
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
            AND mc.cliente_id = co.cliente_id
           WHERE pf.usuario_id = $1
             AND pf.condominio_id = co.id
             AND pf.permiso = 'crear_cuotas'
             AND pf.estado = 'activo'
             AND mco.estado = 'activo'
             AND mc.estado = 'activo'
         )
       RETURNING id, condominio_id, unidad_id,
                 concepto, periodo, monto,
                 vencimiento, estado`,
      [
        req.user.id,
        data.unidadId,
        data.concepto,
        data.periodo,
        data.monto,
        data.vencimiento,
      ]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        message: "Unidad no encontrada o sin permiso financiero",
      });
    }

    return res.status(201).json({
      cuota: result.rows[0],
    });
  })
);

// GET /api/finance/fees/mine
// Mostrar cuotas de las viviendas del usuario.
financeRouter.get(
  "/fees/mine",
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT DISTINCT
         q.id,
         q.unidad_id,
         un.codigo AS unidad,
         q.condominio_id,
         co.nombre AS condominio,
         q.concepto,
         q.periodo,
         q.monto,
         q.vencimiento,
         q.estado
       FROM admincond.cuotas q
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
       WHERE r.usuario_id = $1
         AND r.estado = 'activo'
         AND mco.estado = 'activo'
         AND mc.estado = 'activo'
         AND un.estado = 'activa'
         AND co.estado = 'activo'
         AND cl.estado = 'activo'
       ORDER BY q.periodo DESC, q.id DESC`,
      [req.user.id]
    );

    res.json({ cuotas: result.rows });
  })
);

// POST /api/finance/payments
// Residente registra un pago manual.
financeRouter.post(
  "/payments",
  asyncHandler(async (req, res) => {
    const parsed = paymentSchema.safeParse(req.body);

    if (!parsed.success || Number(parsed.data?.monto) <= 0) {
      return res.status(400).json({
        message: "Datos de pago inválidos",
      });
    }

    const pago = await reportPayment(
      req.user.id,
      parsed.data.cuotaId,
      parsed.data.monto,
      parsed.data.referencia || null
    );

    res.status(201).json({ pago });
  })
);

// GET /api/finance/payments/pending
// Solo personal con permiso de revisión.
financeRouter.get(
  "/payments/pending",
  asyncHandler(async (req, res) => {
    const pagos = await pendingPayments(req.user.id);
    res.json({ pagos });
  })
);

// POST /api/finance/payments/:id/review
// Aprobar o rechazar un pago pendiente.
financeRouter.post(
  "/payments/:id/review",
  asyncHandler(async (req, res) => {
    const id = positiveId.safeParse(req.params.id);
    const body = reviewSchema.safeParse(req.body);

    if (!id.success || !body.success) {
      return res.status(400).json({
        message: "Datos de revisión inválidos",
      });
    }

    const resultado = await reviewPayment(
      req.user.id,
      id.data,
      body.data.decision
    );

    res.json(resultado);
  })
);