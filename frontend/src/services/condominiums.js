
export async function getMyCondominiums(request) {
  const response = await request("/api/condominiums");

  if (!Array.isArray(response?.condominios)) {
    throw new Error("El servidor devolvió una lista de condominios inválida.");
  }

  return response.condominios;
}

export async function getCondominiumById(request, id) {
  const response = await request(
    `/api/condominiums/${encodeURIComponent(id)}`
  );

  if (!response?.condominio) {
    throw new Error("El servidor devolvió un condominio inválido.");
  }

  return response.condominio;
}

export async function getCondominiumContext(request, condominiumId) {
  if (!/^[1-9]\d*$/.test(String(condominiumId))) {
    throw new Error("ID de condominio inválido.");
  }

  const response = await request(
    `/api/condominiums/${encodeURIComponent(condominiumId)}/context`
  );

  if (
    !response?.contexto ||
    String(response.contexto.condominioId) !== String(condominiumId) ||
    !Array.isArray(response.contexto.unidades)
  ) {
    throw new Error(
      "El servidor devolvió un contexto de condominio inválido."
    );
  }

  return response.contexto;
}
