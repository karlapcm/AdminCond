
import { Router } from "express";
import { pool } from "../../database/pool.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireClientAccess } from "../../middleware/authorize.js";

export const clientRouter = Router();

// Todas las rutas requieren inicio de sesión.
clientRouter.use(requireAuth);

// GET /api/clients
// Lista únicamente los clientes del usuario autenticado.
clientRouter.get("/", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.nombre, mc.rol, c.estado
       FROM admincond.clientes c
       JOIN admincond.membresias_cliente mc
         ON mc.cliente_id = c.id
       WHERE mc.usuario_id = $1
         AND mc.estado = 'activo'
         AND c.estado = 'activo'
       ORDER BY c.nombre`,
      [req.user.id]
    );

    res.json({
      clientes: result.rows,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/clients/:clienteId
clientRouter.get(
  "/:clienteId",
  requireClientAccess,
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT id, nombre, estado, creado_en
         FROM admincond.clientes
         WHERE id = $1 AND estado = 'activo'`,
        [req.params.clienteId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          message: "Cliente no encontrado",
        });
      }

      res.json({
        cliente: result.rows[0],
        miRol: req.clientMembership.rol,
      });
    } catch (error) {
      next(error);
    }
  }
);
