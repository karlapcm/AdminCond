
import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";

import {
  createCommunication,
  getCommunications,
  getCommunicationById,
} from "./communication.service.js";

export const communicationRouter = Router();

communicationRouter.use(requireAuth);

// POST /api/communications
// Solo administrador del condominio.
communicationRouter.post("/", async (req, res, next) => {
  try {
    const comunicado = await createCommunication(
      req.user.id,
      req.body
    );

    return res.status(201).json({
      message: "Comunicado publicado correctamente",
      comunicado,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/communications?condominioId=1
// Usuarios con acceso al condominio.
communicationRouter.get("/", async (req, res, next) => {
  try {
    const comunicados = await getCommunications(
      req.user.id,
      req.query.condominioId
    );

    return res.json({ comunicados });
  } catch (error) {
    next(error);
  }
});

// GET /api/communications/:id
// Detalle solo si el usuario tiene acceso al condominio.
communicationRouter.get("/:id", async (req, res, next) => {
  try {
    const comunicado = await getCommunicationById(
      req.user.id,
      req.params.id
    );

    return res.json({ comunicado });
  } catch (error) {
    next(error);
  }
});
