
import { Router } from "express";
import multer from "multer";
import { z } from "zod";

import { requireAuth } from "../auth/auth.middleware.js";

import {
  uploadReceipt,
  downloadReceipt,
} from "./receipt.service.js";

export const receiptRouter = Router();

receiptRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 0,
  },
});

const idSchema = z.coerce.number().int().positive().safe();

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// POST /api/finance/receipts/payments/:paymentId
receiptRouter.post(
  "/payments/:paymentId",
  upload.single("comprobante"),
  asyncHandler(async (req, res) => {
    const id = idSchema.safeParse(req.params.paymentId);

    if (!id.success) {
      return res.status(400).json({
        message: "ID de pago inválido",
      });
    }

    const receipt = await uploadReceipt(
      req.user.id,
      id.data,
      req.file
    );

    res.status(201).json({ comprobante: receipt });
  })
);

// GET /api/finance/receipts/:receiptId
receiptRouter.get(
  "/:receiptId",
  asyncHandler(async (req, res) => {
    const id = idSchema.safeParse(req.params.receiptId);

    if (!id.success) {
      return res.status(400).json({
        message: "ID de comprobante inválido",
      });
    }

    const { receipt, buffer } = await downloadReceipt(
      req.user.id,
      id.data
    );

    res.setHeader("Content-Type", receipt.tipo_mime);
    res.setHeader("Content-Disposition", "attachment");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");

    res.send(buffer);
  })
);
