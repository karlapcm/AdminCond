
import { randomBytes, randomUUID, createHash } from "node:crypto";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { pool } from "../../database/pool.js";

const REFRESH_DAYS = 7;

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function createRefreshToken() {
  return randomBytes(32).toString("base64url");
}

function signAccessToken(userId, sessionId) {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET no configurado correctamente");
  }

  return jwt.sign(
    { sid: sessionId },
    secret,
    {
      algorithm: "HS256",
      subject: String(userId),
      issuer: "admincond-api",
      audience: "admincond-app",
      expiresIn: "15m",
    }
  );
}

export async function login(correo, password) {
  const result = await pool.query(
    `SELECT id, nombre, correo, password_hash
     FROM admincond.usuarios
     WHERE LOWER(correo) = LOWER($1)
       AND estado = 'activo'`,
    [correo]
  );

  const user = result.rows[0];

  if (!user || !(await argon2.verify(user.password_hash, password))) {
    return null;
  }

  const sessionId = randomUUID();
  const refreshToken = createRefreshToken();

  await pool.query(
    `INSERT INTO admincond.sesiones
       (id, usuario_id, refresh_hash, expira_en)
     VALUES ($1, $2, $3, $4)`,
    [
      sessionId,
      user.id,
      hashToken(refreshToken),
      new Date(Date.now() + REFRESH_DAYS * 86400000),
    ]
  );

  return {
    accessToken: signAccessToken(user.id, sessionId),
    refreshToken,
    tokenType: "Bearer",
    expiresIn: 900,
    user: {
      id: user.id,
      nombre: user.nombre,
      correo: user.correo,
    },
  };
}

export async function refreshSession(oldToken) {
  const newToken = createRefreshToken();

  const result = await pool.query(
    `UPDATE admincond.sesiones s
     SET refresh_hash = $1,
         expira_en = $2
     WHERE s.refresh_hash = $3
       AND s.revocada_en IS NULL
       AND s.expira_en > NOW()
       AND EXISTS (
         SELECT 1
         FROM admincond.usuarios u
         WHERE u.id = s.usuario_id
           AND u.estado = 'activo'
       )
     RETURNING s.id, s.usuario_id`,
    [
      hashToken(newToken),
      new Date(Date.now() + REFRESH_DAYS * 86400000),
      hashToken(oldToken),
    ]
  );

  const session = result.rows[0];

  if (!session) return null;

  return {
    accessToken: signAccessToken(session.usuario_id, session.id),
    refreshToken: newToken,
    tokenType: "Bearer",
    expiresIn: 900,
  };
}

export async function logout(refreshToken) {
  await pool.query(
    `UPDATE admincond.sesiones
     SET revocada_en = NOW()
     WHERE refresh_hash = $1
       AND revocada_en IS NULL`,
    [hashToken(refreshToken)]
  );
}
