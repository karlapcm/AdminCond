
import { pool } from "../../database/pool.js";

export async function createUser({ nombre, correo, passwordHash }) {
  const query = `
    INSERT INTO admincond.usuarios
      (nombre, correo, password_hash)
    VALUES ($1, $2, $3)
    RETURNING id, nombre, correo, estado, creado_en
  `;

  const values = [nombre, correo, passwordHash];

  const result = await pool.query(query, values);
  return result.rows[0];
}
