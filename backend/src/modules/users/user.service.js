
import argon2 from "argon2";
import { z } from "zod";
import { createUser } from "./user.repository.js";

const userSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  correo: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12).max(128),
});

export async function registerUser(data) {
  const validated = userSchema.parse(data);

  const passwordHash = await argon2.hash(validated.password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const user = await createUser({
    nombre: validated.nombre,
    correo: validated.correo,
    passwordHash,
  });

  return user;
}
