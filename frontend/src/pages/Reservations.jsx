
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  House,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { useAuth } from "../context/useAuth";
import { getMyCondominiums } from "../services/condominiums";
import { getMyUnits } from "../services/units";
import {
  getAreas,
  createArea,
  getReservations,
  createReservation,
  cancelReservation,
} from "../services/reservations";

import "./Reservations.css";

function formatDate(value) {
  if (!value) return "Fecha no disponible";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }

  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function asLocalDateTime(date) {
  const local = new Date(
    date.getTime() - date.getTimezoneOffset() * 60000
  );

  return local.toISOString().slice(0, 16);
}

function toIso(localValue) {
  if (!localValue) {
    throw new Error("Selecciona la fecha y hora.");
  }

  const date = new Date(localValue);

  if (Number.isNaN(date.getTime())) {
    throw new Error("La fecha ingresada no es válida.");
  }

  return date.toISOString();
}

function validateSchedule(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);

  if (startDate.getTime() <= Date.now()) {
    throw new Error("La reserva debe comenzar en el futuro.");
  }

  const minutes =
    (endDate.getTime() - startDate.getTime()) / 60000;

  if (minutes < 30 || minutes > 240) {
    throw new Error(
      "La duración debe estar entre 30 minutos y 4 horas."
    );
  }
}

function ReservationsWorkspace({
  request,
  condominium,
  units,
}) {
  const condoId = String(condominium.id);
  const isAdmin = condominium.puede_publicar === true;

  const availableUnits = units.filter(
    (unit) => String(unit.condominio_id) === condoId
  );

  const [areas, setAreas] = useState([]);
  const [reservations, setReservations] = useState([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [areaName, setAreaName] = useState("");
  const [areaDescription, setAreaDescription] = useState("");
  const [capacity, setCapacity] = useState("");

  const [areaId, setAreaId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const selectedUnitId = availableUnits.some(
    (unit) => String(unit.id) === unitId
  )
    ? unitId
    : availableUnits.length > 0
      ? String(availableUnits[0].id)
      : "";

  const [selectedAgendaArea, setSelectedAgendaArea] =
    useState("all");

  const loadData = useCallback(async () => {
    const [areaData, reservationData] = await Promise.all([
      getAreas(request, condoId),
      getReservations(request, condoId),
    ]);

    return { areaData, reservationData };
  }, [request, condoId]);

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const { areaData, reservationData } =
          await loadData();

        if (!active) return;

        setAreas(areaData);
        setReservations(reservationData);
        setAreaId(
          areaData.length ? String(areaData[0].id) : ""
        );
      } catch (err) {
        if (active) {
          setError(
            err.message || "No se pudieron cargar las reservas."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    initialize();

    return () => {
      active = false;
    };
  }, [loadData]);

  async function refreshData() {
    const { areaData, reservationData } = await loadData();

    setAreas(areaData);
    setReservations(reservationData);

    if (!areaData.some(
      (area) => String(area.id) === String(areaId)
    )) {
      setAreaId(
        areaData.length ? String(areaData[0].id) : ""
      );
    }
  }

  async function handleRefresh() {
    if (busy) return;

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      await refreshData();
    } catch (err) {
      setError(err.message || "No se pudo actualizar la agenda.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateArea(event) {
    event.preventDefault();

    if (!isAdmin || busy) return;

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      await createArea(request, {
        condominioId: condoId,
        nombre: areaName,
        descripcion: areaDescription,
        capacidad: capacity,
      });

      setAreaName("");
      setAreaDescription("");
      setCapacity("");

      await refreshData();
      setSuccess("Área común registrada correctamente.");
    } catch (err) {
      setError(err.message || "No se pudo registrar el área.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReserve(event) {
    event.preventDefault();

    if (busy || !areaId || !selectedUnitId) return;

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const inicio = toIso(start);
      const fin = toIso(end);

      validateSchedule(inicio, fin);

      await createReservation(request, {
        areaId,
        unidadId: selectedUnitId,
        inicio,
        fin,
      });

      setStart("");
      setEnd("");

      await refreshData();
      setSuccess("Reserva confirmada correctamente.");
    } catch (err) {
      setError(
        err.message || "No se pudo registrar la reserva."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(reservationId) {
    if (busy) return;

    const confirmed = window.confirm(
      "¿Deseas cancelar esta reserva? El horario volverá a estar disponible."
    );

    if (!confirmed) return;

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      await cancelReservation(request, reservationId);
      await refreshData();

      setSuccess("Reserva cancelada correctamente.");
    } catch (err) {
      setError(err.message || "No se pudo cancelar la reserva.");
    } finally {
      setBusy(false);
    }
  }

  const visibleReservations = reservations
    .filter((reservation) => {
      return (
        selectedAgendaArea === "all" ||
        String(reservation.area_id) === selectedAgendaArea
      );
    })
    .sort((a, b) => new Date(a.inicio) - new Date(b.inicio));

  const areaNameById = new Map(
    areas.map((area) => [String(area.id), area.nombre])
  );

  return (
    <div className="reservations-workspace">
      {error && (
        <div className="reservations-message error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div
          className="reservations-message success"
          role="status"
        >
          {success}
        </div>
      )}

      <section className="reservations-panel">
        <div className="reservations-section-head">
          <h2>
            <House size={20} />
            Áreas comunes
          </h2>

          <button
            type="button"
            className="reservations-secondary-button"
            onClick={handleRefresh}
            disabled={busy || loading}
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>

        {loading ? (
          <p className="reservations-muted">
            <LoaderCircle
              size={17}
              className="reservations-spin"
            />
            Cargando áreas y disponibilidad...
          </p>
        ) : areas.length === 0 ? (
          <div className="reservations-empty">
            Todavía no hay áreas comunes activas.
          </div>
        ) : (
          <div className="reservations-areas-grid">
            {areas.map((area) => (
              <article
                className="reservations-area-card"
                key={String(area.id)}
              >
                <span className="reservations-area-icon">
                  <House size={22} />
                </span>
                <h3>{area.nombre}</h3>
                <p>
                  {area.descripcion ||
                    "Sin descripción registrada."}
                </p>
                <span className="reservations-area-capacity">
                  {area.capacidad
                    ? `Capacidad: ${area.capacidad} personas`
                    : "Capacidad no especificada"}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

      {isAdmin && (
        <section className="reservations-panel">
          <div className="reservations-section-head">
            <h2>
              <Plus size={20} />
              Registrar área común
            </h2>
            <span className="reservations-admin-tag">
              Administración
            </span>
          </div>

          <form
            className="reservations-form"
            onSubmit={handleCreateArea}
          >
            <label htmlFor="area-name">Nombre del área</label>
            <input
              id="area-name"
              value={areaName}
              maxLength={120}
              required
              disabled={busy}
              onChange={(e) => setAreaName(e.target.value)}
              placeholder="Ej. Salón de eventos"
            />

            <label htmlFor="area-description">
              Descripción (opcional)
            </label>
            <textarea
              id="area-description"
              value={areaDescription}
              maxLength={500}
              rows={3}
              disabled={busy}
              onChange={(e) =>
                setAreaDescription(e.target.value)
              }
            />

            <label htmlFor="area-capacity">
              Capacidad (opcional)
            </label>
            <input
              id="area-capacity"
              type="number"
              min="1"
              max="100000"
              value={capacity}
              disabled={busy}
              onChange={(e) => setCapacity(e.target.value)}
            />

            <button
              type="submit"
              className="reservations-primary-button"
              disabled={busy || !areaName.trim()}
            >
              <Plus size={17} />
              Registrar área
            </button>
          </form>
        </section>
      )}

      {availableUnits.length > 0 && areas.length > 0 && (
        <section className="reservations-panel">
          <div className="reservations-section-head">
            <h2>
              <CalendarDays size={20} />
              Nueva reserva
            </h2>
          </div>

          <p className="reservations-muted">
            Selecciona un área, tu unidad y un horario futuro.
            La duración permitida es de 30 minutos a 4 horas.
          </p>

          <form
            className="reservations-form"
            onSubmit={handleReserve}
          >
            <div className="reservations-form-grid">
              <div>
                <label htmlFor="reserve-area">Área común</label>
                <select
                  id="reserve-area"
                  required
                  value={areaId}
                  disabled={busy}
                  onChange={(e) => setAreaId(e.target.value)}
                >
                  {areas.map((area) => (
                    <option
                      key={String(area.id)}
                      value={String(area.id)}
                    >
                      {area.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="reserve-unit">Mi unidad</label>
                <select
                  id="reserve-unit"
                  required
                  value={selectedUnitId}
                  disabled={busy}
                  onChange={(e) => setUnitId(e.target.value)}
                >
                  {availableUnits.map((unit) => (
                    <option
                      key={String(unit.id)}
                      value={String(unit.id)}
                    >
                      {unit.codigo || `Unidad ${unit.id}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="reserve-start">
                  Inicio
                </label>
                <input
                  id="reserve-start"
                  type="datetime-local"
                  required
                  min={asLocalDateTime(new Date())}
                  value={start}
                  disabled={busy}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="reserve-end">
                  Fin
                </label>
                <input
                  id="reserve-end"
                  type="datetime-local"
                  required
                  value={end}
                  disabled={busy}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              className="reservations-primary-button"
              disabled={
                busy ||
                !areaId ||
                !selectedUnitId ||
                !start ||
                !end
                }
            >
              <CalendarDays size={17} />
              Confirmar reserva
            </button>
          </form>
        </section>
      )}

      <section className="reservations-panel">
        <div className="reservations-section-head">
          <h2>
            <Clock3 size={20} />
            Agenda de reservas
          </h2>
        </div>

        <div className="reservations-agenda-filter">
          <label htmlFor="agenda-area">Filtrar por área</label>
          <select
            id="agenda-area"
            value={selectedAgendaArea}
            onChange={(e) =>
              setSelectedAgendaArea(e.target.value)
            }
          >
            <option value="all">Todas las áreas</option>
            {areas.map((area) => (
              <option
                key={String(area.id)}
                value={String(area.id)}
              >
                {area.nombre}
              </option>
            ))}
          </select>
        </div>

        {!loading && visibleReservations.length === 0 ? (
          <div className="reservations-empty">
            No hay reservas para mostrar.
          </div>
        ) : (
          <div className="reservations-agenda-list">
            {visibleReservations.map((reservation, index) => {
              const isMine = reservation.es_mia === true;
              const isCancelled =
                reservation.estado === "cancelada";
              const canCancel =
                reservation.id != null &&
                reservation.estado === "confirmada" &&
                (isMine || isAdmin);

              return (
                <article
                  className="reservations-agenda-card"
                  key={
                    reservation.id != null
                      ? String(reservation.id)
                      : `${reservation.area_id}-${reservation.inicio}-${index}`
                  }
                >
                  <div className="reservations-agenda-top">
                    <h3>
                      {areaNameById.get(
                        String(reservation.area_id)
                      ) || "Área común"}
                    </h3>

                    <span
                      className={`reservations-status ${
                        isCancelled
                          ? "cancelled"
                          : isMine
                            ? "mine"
                            : "occupied"
                      }`}
                    >
                      {isCancelled
                        ? "Cancelada"
                        : isMine
                          ? "Mi reserva"
                          : reservation.estado === "ocupado"
                            ? "Ocupado"
                            : "Confirmada"}
                    </span>
                  </div>

                  <p>
                    <Clock3 size={16} />
                    {formatDate(reservation.inicio)}
                    {" — "}
                    {formatDate(reservation.fin)}
                  </p>

                  {canCancel && (
                    <button
                      type="button"
                      className="reservations-cancel-button"
                      disabled={busy}
                      onClick={() =>
                        handleCancel(reservation.id)
                      }
                    >
                      Cancelar reserva
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default function Reservations() {
  const { request } = useAuth();

  const [condominiums, setCondominiums] = useState([]);
  const [units, setUnits] = useState([]);
  const [selectedId, setSelectedId] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const condoData = await getMyCondominiums(request);

        // Si la consulta de unidades falla, no inventamos
        // unidades ni ofrecemos reservas sin verificar.
        const unitData = await getMyUnits(request);

        if (!active) return;

        setCondominiums(condoData);
        setUnits(unitData);

        if (condoData.length) {
          setSelectedId(String(condoData[0].id));
        }
      } catch (err) {
        if (active) {
          setError(
            err.message ||
              "No fue posible cargar tus datos."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    initialize();

    return () => {
      active = false;
    };
  }, [request]);

  const selectedCondominium = condominiums.find(
    (condo) => String(condo.id) === String(selectedId)
  );

  return (
    <main className="reservations-page">
      <div className="reservations-container">
        <header className="reservations-header">
          <Link
            to="/dashboard"
            className="reservations-back"
          >
            <ArrowLeft size={17} />
            Volver al dashboard
          </Link>

          <div className="reservations-heading">
            <div className="reservations-heading-icon">
              <CalendarDays size={29} />
            </div>

            <div>
              <span className="reservations-kicker">
                ADMINCOND · COMUNIDAD
              </span>
              <h1>Reservas de áreas comunes</h1>
              <p>
                Consulta espacios, revisa horarios y
                gestiona tus reservas.
              </p>
            </div>
          </div>
        </header>

        {error && (
          <div className="reservations-message error" role="alert">
            {error}
          </div>
        )}

        <section className="reservations-panel">
          <div className="reservations-section-head">
            <h2>
              <ShieldCheck size={20} />
              Condominio
            </h2>
          </div>

          {loading ? (
            <p className="reservations-muted">
              Cargando tus condominios...
            </p>
          ) : condominiums.length === 0 ? (
            <p className="reservations-muted">
              No tienes condominios disponibles.
            </p>
          ) : (
            <select
              className="reservations-condo-select"
              aria-label="Seleccionar condominio"
              value={selectedId}
              onChange={(event) =>
                setSelectedId(event.target.value)
              }
            >
              {condominiums.map((condo) => (
                <option
                  key={String(condo.id)}
                  value={String(condo.id)}
                >
                  {condo.nombre}
                </option>
              ))}
            </select>
          )}
        </section>

        {selectedCondominium && (
          <ReservationsWorkspace
            key={selectedId}
            request={request}
            condominium={selectedCondominium}
            units={units}
          />
        )}
      </div>
    </main>
  );
}
