
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";

import {
  login,
  refreshSession,
  logout,
} from "./auth.service.js";

import { requireAuth } from "./auth.middleware.js";

export const authRouter = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Demasiados intentos. Intenta más tarde.",
  },
});

const loginSchema = z.object({
  correo: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

const tokenSchema = z.object({
  refreshToken: z.string().min(20).max(512),
});

const handleAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

authRouter.post(
  "/login",
  limiter,
  handleAsync(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Datos inválidos",
      });
    }

    const result = await login(
      parsed.data.correo,
      parsed.data.password
    );

    if (!result) {
      return res.status(401).json({
        message: "Credenciales incorrectas",
      });
    }

    res.json(result);
  })
);

authRouter.post(
  "/refresh",
  limiter,
  handleAsync(async (req, res) => {
    const parsed = tokenSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Refresh token inválido",
      });
    }

    const result = await refreshSession(
      parsed.data.refreshToken
    );

    if (!result) {
      return res.status(401).json({
        message: "Sesión inválida o expirada",
      });
    }

    res.json(result);
  })
);

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

authRouter.post(
  "/logout",
  handleAsync(async (req, res) => {
    const parsed = tokenSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Refresh token inválido",
      });
    }

    await logout(parsed.data.refreshToken);

    res.status(204).end();
  })
);
