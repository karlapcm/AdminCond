
import { Router } from "express";
import { pool } from "../../database/pool.js";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  requireCondominiumAccess,
} from "../../middleware/authorize.js";

export const condominiumRouter = Router();

condominiumRouter.use(requireAuth);

// GET /api/condominiums
// Supercliente ve los de su empresa.
// Otros usuarios ven los condominios asignados.
condominiumRouter.get("/", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT co.id, co.nombre, co.direccion,
              co.cliente_id, co.estado,
              EXISTS (
                SELECT 1
                FROM admincond.membresias_condominio adm
                JOIN admincond.membresias_cliente mc_adm
                  ON mc_adm.usuario_id = adm.usuario_id
                AND mc_adm.cliente_id = adm.cliente_id
                JOIN admincond.usuarios u
                  ON u.id = adm.usuario_id
                WHERE adm.usuario_id = $1
                  AND adm.condominio_id = co.id
                  AND adm.cliente_id = co.cliente_id
                  AND adm.rol = 'administrador'
                  AND adm.estado = 'activo'
                  AND mc_adm.estado = 'activo'
                  AND u.estado = 'activo'
              ) AS puede_publicar
      FROM admincond.condominios co
      JOIN admincond.clientes c
        ON c.id = co.cliente_id
      JOIN admincond.usuarios usuario_actual
        ON usuario_actual.id = $1
      WHERE c.estado = 'activo'
        AND co.estado = 'activo'
        AND usuario_actual.estado = 'activo'
        AND (
          EXISTS (
            SELECT 1
            FROM admincond.membresias_cliente mc
            WHERE mc.usuario_id = $1
              AND mc.cliente_id = co.cliente_id
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
              AND mco.cliente_id = co.cliente_id
              AND mco.condominio_id = co.id
              AND mco.estado = 'activo'
              AND mc.estado = 'activo'
          )
        )
      ORDER BY co.nombre`,
      [req.user.id]
    );

    res.json({
      condominios: result.rows,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/condominiums/:condominioId
condominiumRouter.get(
  "/:condominioId",
  requireCondominiumAccess,
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT id, cliente_id, nombre,
                direccion, estado, creado_en
         FROM admincond.condominios
         WHERE id = $1 AND estado = 'activo'`,
        [req.condominium.id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          message: "Condominio no encontrado",
        });
      }

      res.json({
        condominio: result.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/condominiums/:condominioId/context
 *
 * Consulta el contexto del usuario autenticado.
 * No concede permisos ni modifica datos.
 */
condominiumRouter.get(
  "/:condominioId/context",
  requireCondominiumAccess,
  async (req, res, next) => {
    try {
      const usuarioId = req.user.id;
      const condominioId = req.condominium.id;
      const clienteId = req.condominium.cliente_id;

      const membresias = await pool.query(
        `SELECT
           (
             SELECT mc.rol
             FROM admincond.membresias_cliente mc
             WHERE mc.usuario_id = $1
               AND mc.cliente_id = $2
               AND mc.estado = 'activo'
           ) AS rol_cliente,
           (
             SELECT mco.rol
             FROM admincond.membresias_condominio mco
             WHERE mco.usuario_id = $1
               AND mco.cliente_id = $2
               AND mco.condominio_id = $3
               AND mco.estado = 'activo'
           ) AS rol_condominio`,
        [usuarioId, clienteId, condominioId]
      );

      const unidades = await pool.query(
        `SELECT
           u.id AS unidad_id,
           u.codigo,
           ru.es_propietario,
           ru.es_inquilino,
           ru.es_ocupante,
           ru.responsable_pago,
           ru.es_principal
         FROM admincond.relaciones_unidad ru
         JOIN admincond.unidades u
           ON u.id = ru.unidad_id
          AND u.condominio_id = ru.condominio_id
         WHERE ru.usuario_id = $1
           AND ru.condominio_id = $2
           AND ru.estado = 'activo'
           AND u.estado = 'activa'
         ORDER BY u.codigo`,
        [usuarioId, condominioId]
      );

      res.json({
        contexto: {
          clienteId,
          condominioId,
          condominioNombre: req.condominium.nombre,
          rolCliente: membresias.rows[0].rol_cliente,
          rolCondominio: membresias.rows[0].rol_condominio,
          unidades: unidades.rows.map((unidad) => ({
            unidadId: unidad.unidad_id,
            codigo: unidad.codigo,
            esPropietario: unidad.es_propietario,
            esInquilino: unidad.es_inquilino,
            esOcupante: unidad.es_ocupante,
            responsablePago: unidad.responsable_pago,
            esPrincipal: unidad.es_principal,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

