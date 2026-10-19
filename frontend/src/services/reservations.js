
function requireArray(data, field) {
  if (!Array.isArray(data?.[field])) {
    throw new Error(
      `El servidor devolvió una lista inválida: ${field}.`
    );
  }

  return data[field];
}

// GET /api/reservations/areas?condominioId=...
export async function getAreas(request, condominioId) {
  const data = await request(
    `/api/reservations/areas?condominioId=${encodeURIComponent(
      condominioId
    )}`
  );

  return requireArray(data, "areas");
}

// POST /api/reservations/areas
export async function createArea(request, values) {
  const data = await request("/api/reservations/areas", {
    method: "POST",
    body: {
      condominioId: Number(values.condominioId),
      nombre: values.nombre.trim(),
      descripcion: values.descripcion.trim(),
      capacidad: values.capacidad
        ? Number(values.capacidad)
        : null,
    },
  });

  if (!data?.area) {
    throw new Error("No se confirmó la creación del área.");
  }

  return data.area;
}

// GET /api/reservations?condominioId=...
export async function getReservations(request, condominioId) {
  const data = await request(
    `/api/reservations?condominioId=${encodeURIComponent(
      condominioId
    )}`
  );

  return requireArray(data, "reservas");
}

// POST /api/reservations
export async function createReservation(request, values) {
  const data = await request("/api/reservations", {
    method: "POST",
    body: {
      areaId: Number(values.areaId),
      unidadId: Number(values.unidadId),
      inicio: values.inicio,
      fin: values.fin,
    },
  });

  if (!data?.reserva) {
    throw new Error("No se confirmó la reserva.");
  }

  return data.reserva;
}

// PATCH /api/reservations/:id/cancel
export async function cancelReservation(request, reservationId) {
  const data = await request(
    `/api/reservations/${encodeURIComponent(
      reservationId
    )}/cancel`,
    {
      method: "PATCH",
    }
  );

  if (!data?.reserva) {
    throw new Error("No se confirmó la cancelación.");
  }

  return data.reserva;
}
