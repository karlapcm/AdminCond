
import {
  findAccessibleCondominium,
  findAdministratedCondominium,
  insertCommunication,
  listCommunications,
  findCommunicationById,
} from "./communication.repository.js";

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function validateId(value, field) {
  const text = String(value ?? "");

  if (!/^[1-9]\d*$/.test(text)) {
    throw httpError(400, `${field} invalido`);
  }

  const id = Number(text);

  if (!Number.isSafeInteger(id)) {
    throw httpError(400, `${field} invalido`);
  }

  return id;
}

function validateText(value, field, maxLength) {
  if (typeof value !== "string") {
    throw httpError(400, `${field} es obligatorio`);
  }

  const text = value.trim();

  if (!text || text.length > maxLength) {
    throw httpError(
      400,
      `${field} debe contener entre 1 y ${maxLength} caracteres`
    );
  }

  return text;
}

export async function createCommunication(userId, body) {
  if (!body || typeof body !== "object" ||
      Array.isArray(body)) {
    throw httpError(400, "Datos invalidos");
  }

  const condominioId = validateId(
    body.condominioId,
    "ID de condominio"
  );

  const titulo = validateText(body.titulo, "Titulo", 150);
  const contenido = validateText(
    body.contenido,
    "Contenido",
    5000
  );

  const condominium = await findAdministratedCondominium(
    userId,
    condominioId
  );

  if (!condominium) {
    throw httpError(
      404,
      "Condominio no encontrado o sin permiso para publicar"
    );
  }

  const communication = await insertCommunication({
    clienteId: condominium.cliente_id,
    condominioId,
    autorId: userId,
    titulo,
    contenido,
  });

  if (!communication) {
    throw httpError(403, "Usuario no autorizado");
  }

  return communication;
}

export async function getCommunications(
  userId,
  condominioIdInput
) {
  const condominioId = validateId(
    condominioIdInput,
    "ID de condominio"
  );

  const condominium = await findAccessibleCondominium(
    userId,
    condominioId
  );

  if (!condominium) {
    throw httpError(404, "Condominio no encontrado");
  }

  return listCommunications(condominioId);
}

export async function getCommunicationById(
  userId,
  communicationIdInput
) {
  const id = validateId(
    communicationIdInput,
    "ID de comunicado"
  );

  const communication = await findCommunicationById(id);

  if (!communication) {
    throw httpError(404, "Comunicado no encontrado");
  }

  const condominium = await findAccessibleCondominium(
    userId,
    communication.condominio_id
  );

  if (!condominium ||
      Number(condominium.cliente_id) !==
        Number(communication.cliente_id)) {
    throw httpError(404, "Comunicado no encontrado");
  }

  return communication;
}
