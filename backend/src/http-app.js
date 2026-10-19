
import express from "express";
import helmet from "helmet";
import cors from "cors";
import "dotenv/config";

import { pool } from "./database/pool.js";

import { authRouter } from "./modules/auth/auth.routes.js";
import { clientRouter } from "./modules/clients/client.routes.js";
import { condominiumRouter } from "./modules/condominiums/condominium.routes.js";
import { unitRouter } from "./modules/units/unit.routes.js";
import { invitationRouter } from "./modules/invitations/invitation.routes.js";
import { financeRouter } from "./modules/finance/finance.routes.js";
import { receiptRouter } from "./modules/finance/receipt.routes.js";
import { communicationRouter } from "./modules/communications/communication.routes.js";
import { reservationRouter } from "./modules/reservations/reservation.routes.js";

const app = express();

app.disable("x-powered-by");

app.use(helmet());

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
  })
);

app.use(express.json({ limit: "100kb" }));

// Estado de la API
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "admincond-api",
  });
});

// Estado de la conexión a PostgreSQL
app.get("/api/health/db", async (_req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      status: "ok",
      database: "connected",
    });
  } catch {
    res.status(503).json({
      status: "unavailable",
      database: "disconnected",
    });
  }
});

// Rutas existentes
app.use("/api/auth", authRouter);
app.use("/api/clients", clientRouter);
app.use("/api/condominiums", condominiumRouter);
app.use("/api/units", unitRouter);
app.use("/api/invitations", invitationRouter);
app.use("/api/finance", financeRouter);
app.use("/api/finance/receipts", receiptRouter);
app.use("/api/communications", communicationRouter);
app.use("/api/reservations", reservationRouter);

// Rutas inexistentes
app.use((_req, res) => {
  res.status(404).json({
    message: "Ruta no encontrada",
  });
});

// Manejo centralizado de errores
app.use((err, _req, res, _next) => {
  console.error("API error:", err.code || err.message);

  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      message: "El comprobante no puede superar 5 MB",
    });
  }

  if (err?.name === "MulterError") {
    return res.status(400).json({
      message: "Archivo o formulario inválido",
    });
  }

  if (err?.code === "23505") {
    return res.status(409).json({
      message: "El registro ya existe",
    });
  }

  if (err instanceof SyntaxError && err.status === 400) {
    return res.status(400).json({
      message: "El JSON enviado no es válido",
    });
  }

  if ([400, 401, 403, 404, 409].includes(err.status)) {
    return res.status(err.status).json({
      message: err.message,
    });
  }

  return res.status(500).json({
    message: "Error interno del servidor",
  });
});

export default app;
