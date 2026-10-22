
export async function getMyClients(request) {
  const response = await request("/api/clients");

  if (!Array.isArray(response?.clientes)) {
    throw new Error(
      "El servidor devolvió una lista de clientes inválida."
    );
  }

  return response.clientes;
}
