
import { pool } from "../../database/pool.js";

// Verifica que el usuario pueda leer avisos del condominio.
// Supercliente: acceso por cliente.
// Otros usuarios: membresia activa en el condominio.
export async function findAccessibleCondominium(
  userId,
  condominioId
) {
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
             AND mco.cliente_id = co.cliente_id
             AND mco.condominio_id = co.id
             AND mco.estado = 'activo'
             AND mc.estado = 'activo'
         )
       )`,
    [userId, condominioId]
  );

  return result.rows[0] ?? null;
}

// Publicacion: requiere rol administrador en ese condominio.
export async function findAdministratedCondominium(
  userId,
  condominioId
) {
  const result = await pool.query(
    `SELECT co.id, co.cliente_id
     FROM admincond.condominios co
     JOIN admincond.clientes c
       ON c.id = co.cliente_id
     JOIN admincond.membresias_condominio mco
       ON mco.condominio_id = co.id
      AND mco.cliente_id = co.cliente_id
     JOIN admincond.membresias_cliente mc
       ON mc.usuario_id = mco.usuario_id
      AND mc.cliente_id = co.cliente_id
     JOIN admincond.usuarios u
       ON u.id = mco.usuario_id
     WHERE co.id = $2
       AND mco.usuario_id = $1
       AND mco.rol = 'administrador'
       AND mco.estado = 'activo'
       AND mc.estado = 'activo'
       AND u.estado = 'activo'
       AND co.estado = 'activo'
       AND c.estado = 'activo'`,
    [userId, condominioId]
  );

  return result.rows[0] ?? null;
}

export async function insertCommunication({
  clienteId,
  condominioId,
  autorId,
  titulo,
  contenido,
}) {
  const result = await pool.query(
    `INSERT INTO admincond.comunicados
       (cliente_id, condominio_id, autor_id, titulo, contenido)
     SELECT $1, $2, u.id, $4, $5
     FROM admincond.usuarios u
     WHERE u.id = $3
       AND u.estado = 'activo'
     RETURNING id, cliente_id, condominio_id,
               autor_id, titulo, contenido,
               estado, creado_en`,
    [clienteId, condominioId, autorId, titulo, contenido]
  );

  return result.rows[0] ?? null;
}

export async function listCommunications(condominioId) {
  const result = await pool.query(
    `SELECT co.id, co.cliente_id, co.condominio_id,
            co.autor_id, u.nombre AS autor_nombre,
            co.titulo, co.contenido,
            co.estado, co.creado_en
     FROM admincond.comunicados co
     JOIN admincond.usuarios u
       ON u.id = co.autor_id
     WHERE co.condominio_id = $1
       AND co.estado = 'publicado'
     ORDER BY co.creado_en DESC, co.id DESC
     LIMIT 100`,
    [condominioId]
  );

  return result.rows;
}

export async function findCommunicationById(id) {
  const result = await pool.query(
    `SELECT co.id, co.cliente_id, co.condominio_id,
            co.autor_id, u.nombre AS autor_nombre,
            co.titulo, co.contenido,
            co.estado, co.creado_en
     FROM admincond.comunicados co
     JOIN admincond.usuarios u
       ON u.id = co.autor_id
     WHERE co.id = $1
       AND co.estado = 'publicado'`,
    [id]
  );

  return result.rows[0] ?? null;
}
