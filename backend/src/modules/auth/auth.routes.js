
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { pool } from "../../database/pool.js";
import { createAccessRecovery } from "./auth.recovery.js";

import {
  sendAccessRecoveryEmail,
} from "./auth.recovery.mailer.js";

import {
  consumeAccessRecovery,
} from "./auth.recovery.consume.js";

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

const recoveryRequestSchema = z.object({
  correo: z.email().max(254),
});

authRouter.post(
  "/password-recovery/request",
  limiter,
  handleAsync(async (req, res) => {
    const parsed = recoveryRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Datos inválidos",
      });
    }

    // La función interna puede devolver null,
    // pero nunca revelamos esa diferencia al solicitante.

    const recovery = await createAccessRecovery(
      parsed.data.correo
    );

    if (recovery) {
      try {
        // TEST: utiliza el transporte simulado.
        // Nunca devolver el token en la respuesta HTTP.
        await sendAccessRecoveryEmail({
          to: recovery.to,
          token: recovery.token,
        });
      } catch {
        // Si no se pudo enviar, invalidamos el token
        // para no conservar una recuperación utilizable
        // que no pudo entregarse.
        await pool.query(
          `UPDATE admincond.recuperaciones_acceso
          SET consumido_en = NOW()
          WHERE id = $1
            AND consumido_en IS NULL`,
          [recovery.recoveryId]
        );

        // La respuesta pública sigue siendo genérica.
      }
    }

    return res.status(202).json({
      message:
        "Si el correo corresponde a una cuenta activa, " +
        "recibirás instrucciones para recuperar tu acceso.",
    });
  })
);

/**
 * POST /api/auth/password-recovery/confirm
 *
 * Permite establecer una nueva contraseña
 * mediante un token temporal de un solo uso.
 *
 * No requiere una sesión previa.
 */
const recoveryConfirmSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  nuevaPassword: z.string().min(12).max(128),
});

authRouter.post(
  "/password-recovery/confirm",
  limiter,
  handleAsync(async (req, res) => {
    const parsed = recoveryConfirmSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Solicitud de recuperación inválida",
      });
    }

    const changed = await consumeAccessRecovery(
      parsed.data.token,
      parsed.data.nuevaPassword
    );

    if (!changed) {
      return res.status(400).json({
        message: "Código inválido, vencido o utilizado",
      });
    }

    // Las sesiones anteriores ya fueron revocadas
    // dentro de la transacción PostgreSQL.
    // No iniciamos una sesión automáticamente.
    return res.status(200).json({
      message: "Contraseña actualizada correctamente",
    });
  })
);

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
