
import express from "express";
import helmet from "helmet";
import cors from "cors";
import "dotenv/config";
import { pool } from "./database/pool.js";

const app = express();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";

app.use(helmet());

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
}));

app.use(express.json({ limit: "100kb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "admincond-api",
  });
});

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

app.listen(PORT, HOST, () => {
  console.log(`AdminCond API escuchando en ${HOST}:${PORT}`);
});
