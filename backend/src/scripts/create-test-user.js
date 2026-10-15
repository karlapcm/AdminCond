
import { randomBytes } from "node:crypto";
import { registerUser } from "../modules/users/user.service.js";
import { pool } from "../database/pool.js";

async function main() {
  const nombre = process.argv[2];
  const correo = process.argv[3];

  if (!nombre || !correo) {
    console.error(
      'Uso: node src/scripts/create-test-user.js "Nombre" correo@ejemplo.com'
    );
    process.exitCode = 1;
    return;
  }

  const password = randomBytes(24).toString("base64url");

  const user = await registerUser({
    nombre,
    correo,
    password,
  });

  console.log("\nUsuario creado correctamente:");
  console.log("ID:", user.id);
  console.log("Nombre:", user.nombre);
  console.log("Correo:", user.correo);
  console.log("Estado:", user.estado);
  console.log("\nContraseña temporal:", password);
  console.log("Guárdala de manera segura; no aparecerá otra vez.");
}

try {
  await main();
} catch (error) {
  if (error.code === "23505") {
    console.error("Error: el correo ya está registrado.");
  } else if (error.name === "ZodError") {
    console.error("Error: nombre o correo inválido.");
  } else {
    console.error("No se pudo crear el usuario:", error.message);
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}
