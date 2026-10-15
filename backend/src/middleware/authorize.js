
import { pool } from "../database/pool.js";

// Comprueba que el usuario tenga una membresía activa
// dentro de un cliente activo.
export async function requireClientAccess(req, res, next) {
  try {
    const clienteId = req.params.clienteId;

    if (!/^[1-9]\d*$/.test(clienteId || "")) {
      return res.status(400).json({
        message: "ID de cliente inválido",
      });
    }

    const result = await pool.query(
      `SELECT mc.rol
       FROM admincond.membresias_cliente mc
       JOIN admincond.clientes c
         ON c.id = mc.cliente_id
       WHERE mc.usuario_id = $1
         AND mc.cliente_id = $2
         AND mc.estado = 'activo'
         AND c.estado = 'activo'`,
      [req.user.id, clienteId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Cliente no encontrado",
      });
    }

    req.clientMembership = result.rows[0];
    next();
  } catch (error) {
    next(error);
  }
}

// Comprueba el acceso a un condominio específico.
// Supercliente: acceso a condominios de su cliente.
// Otros usuarios: necesitan asignación directa.
export async function requireCondominiumAccess(req, res, next) {
  try {
    const condominioId = req.params.condominioId;

    if (!/^[1-9]\d*$/.test(condominioId || "")) {
      return res.status(400).json({
        message: "ID de condominio inválido",
      });
    }

    const result = await pool.query(
      `SELECT co.id, co.cliente_id, co.nombre
       FROM admincond.condominios co
       JOIN admincond.clientes c
         ON c.id = co.cliente_id
       WHERE co.id = $2
         AND co.estado = 'activo'
         AND c.estado = 'activo'
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
               AND mco.condominio_id = co.id
               AND mco.cliente_id = co.cliente_id
               AND mco.estado = 'activo'
               AND mc.estado = 'activo'
           )
         )`,
      [req.user.id, condominioId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Condominio no encontrado",
      });
    }

    req.condominium = result.rows[0];
    next();
  } catch (error) {
    next(error);
  }
}
