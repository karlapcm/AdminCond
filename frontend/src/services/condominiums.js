
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
