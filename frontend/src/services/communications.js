
function validateResponseArray(data) {
  if (!Array.isArray(data?.comunicados)) {
    throw new Error(
      "La API devolvió una respuesta inválida de comunicados."
    );
  }

  return data.comunicados;
}

// GET /api/communications?condominioId=...
export async function getCommunications(request, condominioId) {
  if (!condominioId) {
    throw new Error("Selecciona un condominio.");
  }

  const data = await request(
    `/api/communications?condominioId=${encodeURIComponent(
      condominioId
    )}`
  );

  return validateResponseArray(data);
}

// GET /api/communications/:id
export async function getCommunicationDetail(
  request,
  communicationId
) {
  if (!communicationId) {
    throw new Error("El comunicado no es válido.");
  }

  const data = await request(
    `/api/communications/${encodeURIComponent(
      communicationId
    )}`
  );

  if (!data?.comunicado) {
    throw new Error(
      "La API no devolvió el detalle del comunicado."
    );
  }

  return data.comunicado;
}

// POST /api/communications
export async function publishCommunication(
  request,
  { condominioId, titulo, contenido }
) {
  const cleanTitle = titulo.trim();
  const cleanContent = contenido.trim();

  if (!cleanTitle || cleanTitle.length > 150) {
    throw new Error(
      "El título debe contener entre 1 y 150 caracteres."
    );
  }

  if (!cleanContent || cleanContent.length > 5000) {
    throw new Error(
      "El contenido debe contener entre 1 y 5000 caracteres."
    );
  }

  if (!condominioId) {
    throw new Error("Selecciona un condominio.");
  }

  const data = await request("/api/communications", {
    method: "POST",
    body: {
      condominioId: Number(condominioId),
      titulo: cleanTitle,
      contenido: cleanContent,
    },
  });

  if (!data?.comunicado) {
    throw new Error(
      "La API no confirmó la publicación del comunicado."
    );
  }

  return data.comunicado;
}
