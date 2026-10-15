
import express from "express";
import helmet from "helmet";
import cors from "cors";
import "dotenv/config";
import { clientRouter } from "./modules/clients/client.routes.js";
import { condominiumRouter } from "./modules/condominiums/condominium.routes.js";
import { pool } from "./database/pool.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { unitRouter } from "./modules/units/unit.routes.js";
import { invitationRouter } from "./modules/invitations/invitation.routes.js";

const app = express();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";

app.disable("x-powered-by");

app.use(helmet());

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
}));

app.use(express.json({ limit: "100kb" }));

// Comprobar que la API funciona
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "admincond-api",
  });
});

// Comprobar conexión a PostgreSQL
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

// Rutas de autenticación: login, refresh, me y logout
app.use("/api/auth", authRouter);

// Manejo centralizado de errores
app.use((err, _req, res, _next) => {
  console.error("API error:", err.code || err.message);

  if (err.code === "23505") {
    return res.status(409).json({
      message: "Ya existe un registro o solicitud equivalente",
    });
  }

  if (err instanceof SyntaxError && err.status === 400) {
    return res.status(400).json({
      message: "JSON inválido",
    });
  }

  if ([400, 403, 404, 409].includes(err.status)) {
    return res.status(err.status).json({
      message: err.message,
    });
  }

  return res.status(500).json({
    message: "Error interno del servidor",
  });
});

app.use("/api/auth", authRouter);
app.use("/api/clients", clientRouter);
app.use("/api/condominiums", condominiumRouter);
app.use("/api/units", unitRouter);
app.use("/api/invitations", invitationRouter);

app.listen(PORT, HOST, () => {
  console.log(`AdminCond API escuchando en ${HOST}:${PORT}`);
});
