
import { pool } from "../../database/pool.js";

export async function findAccessibleCondominium(userId, condoId) {
  const result = await pool.query(
    `SELECT co.id, co.cliente_id, co.nombre
     FROM admincond.condominios co
     JOIN admincond.clientes c
       ON c.id = co.cliente_id
     JOIN admincond.usuarios u
       ON u.id = $1
     WHERE co.id = $2
       AND co.estado = 'activo'
       AND c.estado = 'activo'
       AND u.estado = 'activo'
       AND (
         EXISTS (
           SELECT 1
           FROM admincond.membresias_cliente mc
           WHERE mc.usuario_id = u.id
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
           WHERE mco.usuario_id = u.id
             AND mco.condominio_id = co.id
             AND mco.cliente_id = co.cliente_id
             AND mco.estado = 'activo'
             AND mc.estado = 'activo'
         )
       )`,
    [userId, condoId]
  );

  return result.rows[0] ?? null;
}

export async function findManagedCondominium(userId, condoId) {
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
      AND mc.cliente_id = mco.cliente_id
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
    [userId, condoId]
  );

  return result.rows[0] ?? null;
}

export async function createArea({
  clienteId,
  condominioId,
  userId,
  nombre,
  descripcion,
  capacidad,
}) {
  const result = await pool.query(
    `INSERT INTO admincond.areas_comunes
       (cliente_id, condominio_id, creada_por,
        nombre, descripcion, capacidad)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, cliente_id, condominio_id,
               nombre, descripcion, capacidad,
               estado, creada_en`,
    [
      clienteId,
      condominioId,
      userId,
      nombre,
      descripcion,
      capacidad,
    ]
  );

  return result.rows[0];
}

export async function listAreas(condominioId) {
  const result = await pool.query(
    `SELECT id, condominio_id, nombre, descripcion,
            capacidad, estado, creada_en
     FROM admincond.areas_comunes
     WHERE condominio_id = $1
       AND estado = 'activa'
     ORDER BY nombre, id`,
    [condominioId]
  );

  return result.rows;
}

export async function findActiveArea(areaId) {
  const result = await pool.query(
    `SELECT a.id, a.cliente_id, a.condominio_id,
            a.nombre
     FROM admincond.areas_comunes a
     JOIN admincond.condominios co
       ON co.id = a.condominio_id
      AND co.cliente_id = a.cliente_id
     JOIN admincond.clientes c
       ON c.id = a.cliente_id
     WHERE a.id = $1
       AND a.estado = 'activa'
       AND co.estado = 'activo'
       AND c.estado = 'activo'`,
    [areaId]
  );

  return result.rows[0] ?? null;
}

export async function hasActiveResidence(
  userId,
  condominioId,
  unidadId
) {
  const result = await pool.query(
    `SELECT 1
     FROM admincond.relaciones_unidad ru
     JOIN admincond.unidades un
       ON un.id = ru.unidad_id
      AND un.condominio_id = ru.condominio_id
     JOIN admincond.membresias_condominio mco
       ON mco.usuario_id = ru.usuario_id
      AND mco.condominio_id = ru.condominio_id
     JOIN admincond.condominios co
       ON co.id = ru.condominio_id
     JOIN admincond.clientes c
       ON c.id = co.cliente_id
     JOIN admincond.membresias_cliente mc
       ON mc.usuario_id = ru.usuario_id
      AND mc.cliente_id = co.cliente_id
     JOIN admincond.usuarios u
       ON u.id = ru.usuario_id
     WHERE ru.usuario_id = $1
       AND ru.condominio_id = $2
       AND ru.unidad_id = $3
       AND ru.estado = 'activo'
       AND un.estado = 'activa'
       AND mco.rol = 'residente'
       AND mco.estado = 'activo'
       AND mc.estado = 'activo'
       AND co.estado = 'activo'
       AND c.estado = 'activo'
       AND u.estado = 'activo'
     LIMIT 1`,
    [userId, condominioId, unidadId]
  );

  return result.rowCount > 0;
}

export async function createReservation({
  areaId,
  condominioId,
  unidadId,
  userId,
  inicio,
  fin,
}) {
  const result = await pool.query(
    `INSERT INTO admincond.reservas_areas
       (area_id, condominio_id, unidad_id,
        usuario_id, inicio, fin)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, area_id, condominio_id,
               unidad_id, usuario_id,
               inicio, fin, estado, creada_en`,
    [areaId, condominioId, unidadId, userId, inicio, fin]
  );

  return result.rows[0];
}

// El administrador consulta la agenda completa.
// Los demas usuarios ven ocupacion anonima,
// excepto sus propias reservas.
export async function listReservations(
  condominioId,
  userId,
  isAdmin
) {
  const result = await pool.query(
    `SELECT
       CASE
         WHEN $3::boolean OR usuario_id = $2
         THEN id
         ELSE NULL
       END AS id,
       area_id,
       inicio,
       fin,
       CASE
         WHEN $3::boolean OR usuario_id = $2
         THEN estado
         ELSE 'ocupado'
       END AS estado,
       CASE
         WHEN $3::boolean OR usuario_id = $2
         THEN unidad_id
         ELSE NULL
       END AS unidad_id,
       (usuario_id = $2) AS es_mia
     FROM admincond.reservas_areas
     WHERE condominio_id = $1
       AND (
         estado = 'confirmada'
         OR usuario_id = $2
         OR $3::boolean
       )
     ORDER BY inicio DESC, area_id
     LIMIT 200`,
    [condominioId, userId, isAdmin]
  );

  return result.rows;
}

// La condicion de autorizacion se aplica tambien
// dentro del UPDATE, no solo en Express.
export async function cancelReservation(reservaId, userId) {
  const result = await pool.query(
    `UPDATE admincond.reservas_areas r
     SET estado = 'cancelada',
         cancelada_por = $2,
         cancelada_en = NOW()
     WHERE r.id = $1
       AND r.estado = 'confirmada'
       AND r.inicio > NOW()
       AND (
         (
           r.usuario_id = $2
           AND EXISTS (
             SELECT 1
             FROM admincond.relaciones_unidad ru
             JOIN admincond.unidades un
               ON un.id = ru.unidad_id
              AND un.condominio_id = ru.condominio_id
             JOIN admincond.membresias_condominio mco
               ON mco.usuario_id = ru.usuario_id
              AND mco.condominio_id = ru.condominio_id
             JOIN admincond.condominios co
               ON co.id = ru.condominio_id
             JOIN admincond.clientes c
               ON c.id = co.cliente_id
             JOIN admincond.membresias_cliente mc
               ON mc.usuario_id = ru.usuario_id
              AND mc.cliente_id = co.cliente_id
             JOIN admincond.usuarios u
               ON u.id = ru.usuario_id
             WHERE ru.usuario_id = $2
               AND ru.unidad_id = r.unidad_id
               AND ru.condominio_id = r.condominio_id
               AND ru.estado = 'activo'
               AND un.estado = 'activa'
               AND mco.rol = 'residente'
               AND mco.estado = 'activo'
               AND mc.estado = 'activo'
               AND co.estado = 'activo'
               AND c.estado = 'activo'
               AND u.estado = 'activo'
           )
         )
         OR EXISTS (
           SELECT 1
           FROM admincond.membresias_condominio mco
           JOIN admincond.membresias_cliente mc
             ON mc.usuario_id = mco.usuario_id
            AND mc.cliente_id = mco.cliente_id
           JOIN admincond.condominios co
             ON co.id = mco.condominio_id
            AND co.cliente_id = mco.cliente_id
           JOIN admincond.clientes c
             ON c.id = co.cliente_id
           JOIN admincond.usuarios u
             ON u.id = mco.usuario_id
           WHERE mco.usuario_id = $2
             AND mco.condominio_id = r.condominio_id
             AND mco.rol = 'administrador'
             AND mco.estado = 'activo'
             AND mc.estado = 'activo'
             AND co.estado = 'activo'
             AND c.estado = 'activo'
             AND u.estado = 'activo'
         )
       )
     RETURNING id, area_id, condominio_id,
               estado, cancelada_en`,
    [reservaId, userId]
  );

  return result.rows[0] ?? null;
}
