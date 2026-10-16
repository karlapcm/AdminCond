
export async function apiRequest(
  path,
  { method = "GET", body, token } = {}
) {
  const headers = {
    Accept: "application/json",
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;

  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "No se pudo conectar con el servidor. Comprueba que la API esté funcionando."
    );
  }

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      data?.message || `Error del servidor (${response.status})`
    );
    error.status = response.status;
    throw error;
  }

  return data;
}
