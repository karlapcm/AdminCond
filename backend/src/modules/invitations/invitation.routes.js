
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";

import { requireAuth } from "../auth/auth.middleware.js";

import {
  requestResident,
  pendingRequests,
  reviewRequest,
  acceptInvitation,
} from "./invitation.service.js";

export const invitationRouter = Router();

invitationRouter.use(requireAuth);

// El límite ampliado solo se aplica a la API aislada
// de pruebas automatizadas, nunca a producción.
const isAutomatedTest =
  process.env.NODE_ENV === "test" &&
  process.env.DB_NAME === "admincond_test";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isAutomatedTest ? 1000 : 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const idSchema = z.coerce.number().int().positive().safe();
const emailSchema = z.email().max(254);

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// POST /api/invitations/request
// El responsable principal solicita un residente.
invitationRouter.post(
  "/request",
  limiter,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      unidadId: idSchema,
      correo: emailSchema,
    });

    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Datos de solicitud inválidos",
      });
    }

    const result = await requestResident(
      req.user.id,
      parsed.data.unidadId,
      parsed.data.correo
    );

    res.status(201).json({ solicitud: result });
  })
);

// GET /api/invitations/pending
// Administradores consultan solicitudes pendientes.
invitationRouter.get(
  "/pending",
  asyncHandler(async (req, res) => {
    const solicitudes = await pendingRequests(req.user.id);
    res.json({ solicitudes });
  })
);

// POST /api/invitations/:id/review
// Administrador aprueba o rechaza.
invitationRouter.post(
  "/:id/review",
  limiter,
  asyncHandler(async (req, res) => {
    // Entrega manual del token exclusivamente
    // para el laboratorio local.
    if (process.env.ALLOW_DEV_INVITATION_TOKENS !== "true") {
      return res.status(503).json({
        message: "Configura primero la entrega de invitaciones",
      });
    }

    const id = idSchema.safeParse(req.params.id);

    const body = z.object({
      decision: z.enum(["aprobar", "rechazar"]),
    }).safeParse(req.body);

    if (!id.success || !body.success) {
      return res.status(400).json({
        message: "Revisión inválida",
      });
    }

    const result = await reviewRequest(
      req.user.id,
      id.data,
      body.data.decision
    );

    res.json(result);
  })
);

// POST /api/invitations/accept
// El invitado acepta con su propia cuenta.
invitationRouter.post(
  "/accept",
  limiter,
  asyncHandler(async (req, res) => {
    const parsed = z.object({
      token: z.string().min(20).max(512),
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Token inválido",
      });
    }

    const result = await acceptInvitation(
      req.user.id,
      parsed.data.token
    );

    res.json(result);
  })
);
