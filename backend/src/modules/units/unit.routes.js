
import { Router } from "express";
import { pool } from "../../database/pool.js";
import { requireAuth } from "../auth/auth.middleware.js";

export const unitRouter = Router();

unitRouter.use(requireAuth);

function validId(id) {
  return /^[1-9]\d*$/.test(id || "");
}

// GET /api/units/mine
// Muestra únicamente las unidades vinculadas al usuario.
unitRouter.get("/mine", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.codigo, u.tipo,
              u.condominio_id,
              c.nombre AS condominio,
              r.es_propietario,
              r.es_inquilino,
              r.es_ocupante,
              r.responsable_pago,
              r.es_principal
       FROM admincond.relaciones_unidad r
       JOIN admincond.unidades u
         ON u.id = r.unidad_id
        AND u.condominio_id = r.condominio_id
       JOIN admincond.condominios c
         ON c.id = u.condominio_id
       JOIN admincond.clientes cl
         ON cl.id = c.cliente_id
       JOIN admincond.membresias_condominio mc
         ON mc.usuario_id = r.usuario_id
        AND mc.condominio_id = c.id
        AND mc.cliente_id = cl.id
       JOIN admincond.membresias_cliente mcl
         ON mcl.usuario_id = r.usuario_id
        AND mcl.cliente_id = cl.id
       WHERE r.usuario_id = $1
         AND r.estado = 'activo'
         AND mc.estado = 'activo'
         AND mcl.estado = 'activo'
         AND u.estado = 'activa'
         AND c.estado = 'activo'
         AND cl.estado = 'activo'
       ORDER BY c.nombre, u.codigo`,
      [req.user.id]
    );

    res.json({ unidades: result.rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/units/condominium/:condominioId
// Solo administradores asignados o superclientes.
unitRouter.get(
  "/condominium/:condominioId",
  async (req, res, next) => {
    try {
      const id = req.params.condominioId;

      if (!validId(id)) {
        return res.status(400).json({
          message: "ID de condominio inválido",
        });
      }

      const access = await pool.query(
        `SELECT 1
         FROM admincond.condominios c
         JOIN admincond.clientes cl
           ON cl.id = c.cliente_id
         WHERE c.id = $2
           AND c.estado = 'activo'
           AND cl.estado = 'activo'
           AND (
             EXISTS (
               SELECT 1
               FROM admincond.membresias_cliente mc
               WHERE mc.usuario_id = $1
                 AND mc.cliente_id = cl.id
                 AND mc.rol = 'supercliente'
                 AND mc.estado = 'activo'
             )
             OR EXISTS (
               SELECT 1
               FROM admincond.membresias_condominio mco
               JOIN admincond.membresias_cliente mc
                 ON mc.usuario_id = mco.usuario_id
                AND mc.cliente_id = mco.cliente_id
               WHERE mco.usuario_id = $1
                 AND mco.condominio_id = c.id
                 AND mco.cliente_id = cl.id
                 AND mco.rol = 'administrador'
                 AND mco.estado = 'activo'
                 AND mc.estado = 'activo'
             )
           )`,
        [req.user.id, id]
      );

      if (access.rowCount === 0) {
        return res.status(404).json({
          message: "Condominio no encontrado",
        });
      }

      const result = await pool.query(
        `SELECT id, condominio_id, sector_id,
                edificio_id, codigo, tipo, estado
         FROM admincond.unidades
         WHERE condominio_id = $1
           AND estado = 'activa'
         ORDER BY codigo`,
        [id]
      );

      res.json({ unidades: result.rows });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/units/:unitId
// El usuario debe ser administrador autorizado,
// supercliente o estar relacionado con la unidad.
unitRouter.get("/:unitId", async (req, res, next) => {
  try {
    const id = req.params.unitId;

    if (!validId(id)) {
      return res.status(400).json({
        message: "ID de unidad inválido",
      });
    }

    const result = await pool.query(
      `SELECT u.id, u.codigo, u.tipo,
              u.condominio_id, u.sector_id,
              u.edificio_id, u.estado
       FROM admincond.unidades u
       JOIN admincond.condominios c
         ON c.id = u.condominio_id
       JOIN admincond.clientes cl
         ON cl.id = c.cliente_id
       WHERE u.id = $2
         AND u.estado = 'activa'
         AND c.estado = 'activo'
         AND cl.estado = 'activo'
         AND (
           EXISTS (
             SELECT 1
             FROM admincond.membresias_cliente mc
             WHERE mc.usuario_id = $1
               AND mc.cliente_id = cl.id
               AND mc.rol = 'supercliente'
               AND mc.estado = 'activo'
           )
           OR EXISTS (
             SELECT 1
             FROM admincond.membresias_condominio mco
             JOIN admincond.membresias_cliente mc
               ON mc.usuario_id = mco.usuario_id
              AND mc.cliente_id = mco.cliente_id
             WHERE mco.usuario_id = $1
               AND mco.condominio_id = c.id
               AND mco.cliente_id = cl.id
               AND mco.rol = 'administrador'
               AND mco.estado = 'activo'
               AND mc.estado = 'activo'
           )
           OR EXISTS (
             SELECT 1
             FROM admincond.relaciones_unidad r
             JOIN admincond.membresias_condominio mco
               ON mco.usuario_id = r.usuario_id
              AND mco.condominio_id = r.condominio_id
              AND mco.cliente_id = cl.id
             JOIN admincond.membresias_cliente mc
               ON mc.usuario_id = r.usuario_id
              AND mc.cliente_id = cl.id
             WHERE r.usuario_id = $1
               AND r.unidad_id = u.id
               AND r.condominio_id = c.id
               AND r.estado = 'activo'
               AND mco.estado = 'activo'
               AND mc.estado = 'activo'
           )
         )`,
      [req.user.id, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Unidad no encontrada",
      });
    }

    res.json({ unidad: result.rows[0] });
  } catch (error) {
    next(error);
  }
});
