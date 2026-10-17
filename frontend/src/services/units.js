
export async function getCondominiumUnits(request, condominiumId) {
  const response = await request(
    `/api/units/condominium/${encodeURIComponent(condominiumId)}`
  );

  if (!Array.isArray(response?.unidades)) {
    throw new Error("El servidor devolvió unidades inválidas.");
  }

  return response.unidades;
}

export async function getMyUnits(request) {
  const response = await request("/api/units/mine");

  if (!Array.isArray(response?.unidades)) {
    throw new Error("El servidor devolvió unidades inválidas.");
  }

  return response.unidades;
}
