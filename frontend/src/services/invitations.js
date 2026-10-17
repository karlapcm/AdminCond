
export async function getPrincipalUnits(request) {
  const data = await request("/api/units/mine");

  if (!Array.isArray(data?.unidades)) {
    throw new Error("Respuesta inválida al consultar unidades.");
  }

  return data.unidades.filter(
    (unit) => unit.es_principal === true
  );
}

export async function createResidentRequest(
  request,
  unidadId,
  correo
) {
  const data = await request("/api/invitations/request", {
    method: "POST",
    body: {
      unidadId: Number(unidadId),
      correo: correo.trim(),
    },
  });

  return data.solicitud;
}

export async function getPendingRequests(request) {
  const data = await request("/api/invitations/pending");

  if (!Array.isArray(data?.solicitudes)) {
    throw new Error("Respuesta inválida de solicitudes pendientes.");
  }

  return data.solicitudes;
}

export async function reviewResidentRequest(
  request,
  solicitudId,
  decision
) {
  return request(
    `/api/invitations/${encodeURIComponent(solicitudId)}/review`,
    {
      method: "POST",
      body: { decision },
    }
  );
}

export async function acceptResidentInvitation(request, token) {
  return request("/api/invitations/accept", {
    method: "POST",
    body: { token: token.trim() },
  });
}
