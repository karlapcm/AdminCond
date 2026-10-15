
import express from "express";
import helmet from "helmet";
import cors from "cors";
import "dotenv/config";

import { pool } from "./database/pool.js";
import { authRouter } from "./modules/auth/auth.routes.js";

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
  console.error("API error:", err.message);

  if (err instanceof SyntaxError && err.status === 400) {
    return res.status(400).json({
      message: "JSON inválido",
    });
  }

  res.status(500).json({
    message: "Error interno del servidor",
  });
});

app.listen(PORT, HOST, () => {
  console.log(`AdminCond API escuchando en ${HOST}:${PORT}`);
});
