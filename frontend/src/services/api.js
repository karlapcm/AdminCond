
export async function apiRequest(
  path,
  { method = "GET", body, token, responseType } = {}
) {
  const headers = {
    Accept: "application/json",
  };

  if (body !== undefined && !(body instanceof FormData)) {
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
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "No pudimos conectar con AdminCond. Intenta nuevamente en unos momentos."
    );
  }

  if (response.status === 204) {
    return null;
  }

  if (response.ok && responseType === 'blob') return response.blob();
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
