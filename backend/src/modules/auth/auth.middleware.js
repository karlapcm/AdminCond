
import jwt from "jsonwebtoken";
import { pool } from "../../database/pool.js";

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Token requerido",
    });
  }

  try {
    const payload = jwt.verify(
      header.slice(7),
      process.env.JWT_SECRET,
      {
        algorithms: ["HS256"],
        issuer: "admincond-api",
        audience: "admincond-app",
      }
    );

    if (!payload.sid || !payload.sub) {
      return res.status(401).json({
        message: "Token inválido",
      });
    }

    const result = await pool.query(
      `SELECT u.id, u.nombre, u.correo
       FROM admincond.sesiones s
       JOIN admincond.usuarios u
         ON u.id = s.usuario_id
       WHERE s.id = $1
         AND u.id = $2
         AND s.revocada_en IS NULL
         AND s.expira_en > NOW()
         AND u.estado = 'activo'`,
      [payload.sid, payload.sub]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({
        message: "Sesión inválida o revocada",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        message: "Token inválido o expirado",
      });
    }

    next(error);
  }
}
