
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";

import {
  login,
  refreshSession,
  logout,
} from "./auth.service.js";

import { requireAuth } from "./auth.middleware.js";
import {
  setRefreshCookie,
  getRefreshCookie,
  clearRefreshCookie,
} from "./auth.cookies.js";

export const authRouter = Router();

const isAutomatedTest =
  process.env.NODE_ENV === "test" &&
  process.env.DB_NAME === "admincond_test";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isAutomatedTest ? 1000 : 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Demasiados intentos. Intenta más tarde.",
  },
});

// Evita solicitudes de autenticación iniciadas desde
// un origen web distinto al configurado para AdminCond.

function requireTrustedOrigin(req, res, next) {
  const origin = req.get("Origin");

  const allowedOrigin =
    process.env.FRONTEND_URL || "http://localhost:5173";

  // Las operaciones de autenticación basadas en cookies
  // deben proceder del frontend permitido.
  // Rechazamos también solicitudes sin Origin.
  if (origin !== allowedOrigin) {
    return res.status(403).json({
      message: "Origen no autorizado",
    });
  }

  next();
}

const loginSchema = z.object({
  correo: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

const handleAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

authRouter.post(
  "/login",
  limiter,
  requireTrustedOrigin,
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

    // El navegador recibirá el refresh token también por una cookie HttpOnly
    setRefreshCookie(res, result.refreshToken);

    res.json({
      accessToken: result.accessToken,
      tokenType: result.tokenType,
      expiresIn: result.expiresIn,
      user: result.user,
    });
  })
);

authRouter.post(
  "/refresh",
  limiter,
  requireTrustedOrigin,
  handleAsync(async (req, res) => {
    // El refresh token se obtiene solo de la cookie HttpOnly.
    const refreshToken = getRefreshCookie(req);

    if (!refreshToken) {
      return res.status(401).json({
        message: "Sesión inválida o expirada",
      });
    }

    // La renovación rota el token en PostgreSQL.
    const result = await refreshSession(refreshToken);

    if (!result) {
      clearRefreshCookie(res);

      return res.status(401).json({
        message: "Sesión inválida o expirada",
      });
    }

    // Reemplazar el token anterior en la cookie.
    setRefreshCookie(res, result.refreshToken);

    // Nunca devolver el refresh token en JSON.
    res.json({
      accessToken: result.accessToken,
      tokenType: result.tokenType,
      expiresIn: result.expiresIn,
    });
  })
);

// GET /api/auth/me
// Recuperar los datos del usuario autenticado.
authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

authRouter.post(
  "/logout",
  requireTrustedOrigin,
  handleAsync(async (req, res) => {
    const refreshToken = getRefreshCookie(req);

    // Revocar la sesión existente, si hay un token.
    if (refreshToken) {
      await logout(refreshToken);
    }

    // Eliminar la cookie del navegador.
    clearRefreshCookie(res);

    res.status(204).end();
  })
);