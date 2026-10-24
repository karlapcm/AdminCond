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

import {
  assertInvitationMailConfigured,
} from "./invitation.mailer.js";

import {
  dispatchInvitation,
} from "./invitation.dispatch.js";

import {
  reissueFailedInvitation,
} from "./invitation.reissue.js";

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
    const isTestLab =
      process.env.NODE_ENV === "test" &&
      process.env.DB_NAME === "admincond_test" &&
      process.env.ALLOW_DEV_INVITATION_TOKENS === "true";

    const id = idSchema.safeParse(req.params.id);

    const body = z.object({
      decision: z.enum(["aprobar", "rechazar"]),
    }).safeParse(req.body);

    if (!id.success || !body.success) {
      return res.status(400).json({
        message: "Revisión inválida",
      });
    }

    // Solo aprobar requiere generar y entregar una invitación.
    // Rechazar debe funcionar aunque SMTP no esté configurado.
    if (!isTestLab && body.data.decision === "aprobar") {
      try {
        assertInvitationMailConfigured();
      } catch {
        return res.status(503).json({
          message: "Servicio de invitaciones no disponible",
        });
      }
    }

    const result = await reviewRequest(
      req.user.id,
      id.data,
      body.data.decision
    );

    if (body.data.decision === "rechazar") {
      return res.json({
        estado: "rechazada",
      });
    }

    // Exclusivamente TEST: conserva el token para
    // las pruebas automatizadas.
    if (isTestLab) {
      return res.json(result);
    }

    // Producción: token únicamente en memoria del backend.
    const invitation = result.invitacion;

    const delivery = await dispatchInvitation({
      invitationId: invitation.id,
      to: invitation.correoDestino,
      token: invitation.token,
      expiresInHours: invitation.expiraEnHoras,
    });

    // Nunca devolver el token al navegador.
    return res.json({
      estado: "aprobada",
      entrega: delivery.estadoEntrega,
    });
  })
);
/**
 * POST /api/invitations/:id/reissue
 *
 * Reemite una invitación cuya entrega falló.
 * La autorización se verifica en PostgreSQL.
 *
 * No reintenta automáticamente estados inciertos.
 */
invitationRouter.post(
  "/:id/reissue",
  limiter,
  asyncHandler(async (req, res) => {
    const isTestLab =
      process.env.NODE_ENV === "test" &&
      process.env.DB_NAME === "admincond_test" &&
      process.env.ALLOW_DEV_INVITATION_TOKENS === "true";

    const id = idSchema.safeParse(req.params.id);

    if (!id.success) {
      return res.status(400).json({
        message: "Identificador inválido",
      });
    }

    // Fuera de TEST exigimos SMTP antes de cambiar
    // el token y su estado en PostgreSQL.
    if (!isTestLab) {
      try {
        assertInvitationMailConfigured();
      } catch {
        return res.status(503).json({
          message: "Servicio de invitaciones no disponible",
        });
      }
    }

    const invitation = await reissueFailedInvitation(
      req.user.id,
      id.data
    );

    if (!invitation) {
      return res.status(404).json({
        message: "Invitación no disponible para reemisión",
      });
    }

    // Únicamente laboratorio aislado TEST.
    if (isTestLab) {
      return res.json({
        estado: "reemitida",
        invitacion: {
          id: invitation.invitationId,
          token: invitation.token,
          correoDestino: invitation.to,
          expiraEnHoras: invitation.expiresInHours,
        },
      });
    }

    // En producción nunca devolvemos el token.
    const delivery = await dispatchInvitation(invitation);

    return res.json({
      estado: "reemitida",
      entrega: delivery.estadoEntrega,
    });
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
