
import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";

import {
  registerArea,
  getAreas,
  registerReservation,
  getReservations,
  cancelUserReservation,
} from "./reservation.service.js";

export const reservationRouter = Router();

reservationRouter.use(requireAuth);

// POST /api/reservations/areas
reservationRouter.post("/areas", async (req, res, next) => {
  try {
    const area = await registerArea(req.user.id, req.body);

    res.status(201).json({
      message: "Área común registrada correctamente",
      area,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/reservations/areas?condominioId=1
reservationRouter.get("/areas", async (req, res, next) => {
  try {
    const areas = await getAreas(
      req.user.id,
      req.query.condominioId
    );

    res.json({ areas });
  } catch (error) {
    next(error);
  }
});

// POST /api/reservations
reservationRouter.post("/", async (req, res, next) => {
  try {
    const reserva = await registerReservation(
      req.user.id,
      req.body
    );

    res.status(201).json({
      message: "Reserva confirmada correctamente",
      reserva,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/reservations?condominioId=1
reservationRouter.get("/", async (req, res, next) => {
  try {
    const reservas = await getReservations(
      req.user.id,
      req.query.condominioId
    );

    res.json({ reservas });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/reservations/:id/cancel
reservationRouter.patch("/:id/cancel", async (req, res, next) => {
  try {
    const reserva = await cancelUserReservation(
      req.user.id,
      req.params.id
    );

    res.json({
      message: "Reserva cancelada correctamente",
      reserva,
    });
  } catch (error) {
    next(error);
  }
});
