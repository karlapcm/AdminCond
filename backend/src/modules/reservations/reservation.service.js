
import {
  findAccessibleCondominium,
  findManagedCondominium,
  createArea,
  listAreas,
  findActiveArea,
  hasActiveResidence,
  createReservation,
  listReservations,
  cancelReservation,
} from "./reservation.repository.js";

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function validId(value, field) {
  const text = String(value ?? "");

  if (!/^[1-9]\d*$/.test(text)) {
    throw httpError(400, `${field} inválido`);
  }

  const id = Number(text);

  if (!Number.isSafeInteger(id)) {
    throw httpError(400, `${field} inválido`);
  }

  return id;
}

function validText(value, field, max, required = true) {
  if (value == null && !required) return null;

  if (typeof value !== "string") {
    throw httpError(400, `${field} inválido`);
  }

  const clean = value.trim();

  if ((!clean && required) || clean.length > max) {
    throw httpError(
      400,
      `${field} debe tener entre 1 y ${max} caracteres`
    );
  }

  return clean || null;
}

function validDate(value, field) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    throw httpError(
      400,
      `${field} debe usar formato ISO 8601 con zona horaria`
    );
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw httpError(400, `${field} inválido`);
  }

  return parsed;
}

export async function registerArea(userId, body) {
  if (!body || typeof body !== "object" ||
      Array.isArray(body)) {
    throw httpError(400, "Datos inválidos");
  }

  const condoId = validId(
    body.condominioId,
    "ID de condominio"
  );
  const nombre = validText(body.nombre, "Nombre", 120);
  const descripcion = validText(
    body.descripcion,
    "Descripción",
    500,
    false
  );

  let capacidad = null;

  if (body.capacidad != null && body.capacidad !== "") {
    capacidad = validId(body.capacidad, "Capacidad");
    if (capacidad > 100000) {
      throw httpError(400, "Capacidad fuera de rango");
    }
  }

  const condo = await findManagedCondominium(userId, condoId);

  if (!condo) {
    throw httpError(
      404,
      "Condominio no encontrado o sin permiso"
    );
  }

  return createArea({
    clienteId: condo.cliente_id,
    condominioId: condoId,
    userId,
    nombre,
    descripcion,
    capacidad,
  });
}

export async function getAreas(userId, condoInput) {
  const condoId = validId(
    condoInput,
    "ID de condominio"
  );

  const condo = await findAccessibleCondominium(
    userId,
    condoId
  );

  if (!condo) {
    throw httpError(404, "Condominio no encontrado");
  }

  return listAreas(condoId);
}

export async function registerReservation(userId, body) {
  if (!body || typeof body !== "object" ||
      Array.isArray(body)) {
    throw httpError(400, "Datos inválidos");
  }

  const areaId = validId(body.areaId, "ID de área");
  const unidadId = validId(body.unidadId, "ID de unidad");

  const inicio = validDate(body.inicio, "Inicio");
  const fin = validDate(body.fin, "Fin");

  if (inicio.getTime() <= Date.now()) {
    throw httpError(
      400,
      "Solo se permiten reservas futuras"
    );
  }

  const durationMinutes =
    (fin.getTime() - inicio.getTime()) / 60000;

  if (durationMinutes < 30 || durationMinutes > 240) {
    throw httpError(
      400,
      "La reserva debe durar entre 30 minutos y 4 horas"
    );
  }

  const area = await findActiveArea(areaId);

  if (!area) {
    throw httpError(404, "Área común no encontrada");
  }

  const resident = await hasActiveResidence(
    userId,
    area.condominio_id,
    unidadId
  );

  if (!resident) {
    throw httpError(
      404,
      "Unidad no encontrada o sin permiso de reserva"
    );
  }

  try {
    return await createReservation({
      areaId,
      condominioId: area.condominio_id,
      unidadId,
      userId,
      inicio: inicio.toISOString(),
      fin: fin.toISOString(),
    });
  } catch (error) {
    // La restricción GiST de PostgreSQL impide
    // conflictos incluso con peticiones simultáneas.
    if (error.code === "23P01") {
      throw httpError(
        409,
        "El área ya está reservada en ese horario"
      );
    }

    throw error;
  }
}

export async function getReservations(userId, condoInput) {
  const condoId = validId(
    condoInput,
    "ID de condominio"
  );

  const condo = await findAccessibleCondominium(
    userId,
    condoId
  );

  if (!condo) {
    throw httpError(404, "Condominio no encontrado");
  }

  const managed = await findManagedCondominium(
    userId,
    condoId
  );

  return listReservations(
    condoId,
    userId,
    Boolean(managed)
  );
}

export async function cancelUserReservation(userId, idInput) {
  const id = validId(idInput, "ID de reserva");

  const reservation = await cancelReservation(id, userId);

  if (!reservation) {
    throw httpError(
      404,
      "Reserva no encontrada, sin permiso o no cancelable"
    );
  }

  return reservation;
}
