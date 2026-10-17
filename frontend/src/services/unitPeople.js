
export async function getUnitPeople(request, unitId) {
  const response = await request(
    `/api/units/${encodeURIComponent(unitId)}/people`
  );

  if (!Array.isArray(response?.personas)) {
    throw new Error("La respuesta de personas no es válida.");
  }

  return response.personas;
}
