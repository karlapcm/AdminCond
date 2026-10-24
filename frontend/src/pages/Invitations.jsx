
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  Check,
  ClipboardCheck,
  Clock3,
  KeyRound,
  LoaderCircle,
  Mail,
  RefreshCw,
  Send,
  ShieldCheck,
  UserRoundPlus,
  X,
} from "lucide-react";

import { useAuth } from "../context/useAuth";
import {
  getPrincipalUnits,
  createResidentRequest,
  getPendingRequests,
  reviewResidentRequest,
  acceptResidentInvitation,
} from "../services/invitations";

function formatDate(value) {
  if (!value) return "Sin fecha";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }

  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function Invitations() {
  const { user, request } = useAuth();

  const [units, setUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(true);
  const [unitsError, setUnitsError] = useState("");

  const [pending, setPending] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingError, setPendingError] = useState("");

  const [selectedUnit, setSelectedUnit] = useState("");
  const [email, setEmail] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestError, setRequestError] = useState("");

  const [reviewingId, setReviewingId] = useState(null);
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewError, setReviewError] = useState("");

  // Token de laboratorio: solo en memoria.
  const [devInvitation, setDevInvitation] = useState(null);

  const [invitationToken, setInvitationToken] = useState("");
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [acceptMessage, setAcceptMessage] = useState("");
  const [acceptError, setAcceptError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      const [unitsResult, pendingResult] = await Promise.allSettled([
        getPrincipalUnits(request),
        getPendingRequests(request),
      ]);

      if (!active) return;

      if (unitsResult.status === "fulfilled") {
        setUnits(unitsResult.value);
      } else {
        setUnitsError(
          unitsResult.reason?.message ||
            "No se pudieron cargar tus unidades."
        );
      }

      if (pendingResult.status === "fulfilled") {
        setPending(pendingResult.value);
      } else {
        setPendingError(
          pendingResult.reason?.message ||
            "No se pudieron cargar las solicitudes."
        );
      }

      setUnitsLoading(false);
      setPendingLoading(false);
    }

    loadInitialData();

    return () => {
      active = false;
    };
  }, [request]);

  async function handleCreateRequest(event) {
    event.preventDefault();

    if (!selectedUnit) {
      setRequestError("Selecciona una unidad.");
      return;
    }

    setRequestLoading(true);
    setRequestError("");
    setRequestMessage("");

    try {
      const solicitud = await createResidentRequest(
        request,
        selectedUnit,
        email
      );

      setRequestMessage(
        `Solicitud #${solicitud.id} registrada correctamente. ` +
          "Está pendiente de revisión administrativa."
      );
      setEmail("");
    } catch (error) {
      setRequestError(
        error.message || "No se pudo registrar la solicitud."
      );
    } finally {
      setRequestLoading(false);
    }
  }

  async function handleRefreshPending() {
    setPendingLoading(true);
    setPendingError("");

    try {
      const data = await getPendingRequests(request);
      setPending(data);
    } catch (error) {
      setPendingError(
        error.message || "No se pudieron actualizar las solicitudes."
      );
    } finally {
      setPendingLoading(false);
    }
  }

  async function handleReview(solicitud, decision) {
    if (reviewingId !== null) return;

    const confirmed = window.confirm(
      decision === "aprobar"
        ? `¿Aprobar la solicitud #${solicitud.id} para ${solicitud.correo_invitado}?`
        : `¿Rechazar la solicitud #${solicitud.id}?`
    );

    if (!confirmed) return;

    setReviewingId(String(solicitud.id));
    setReviewError("");
    setReviewMessage("");
    setDevInvitation(null);

    try {
      const result = await reviewResidentRequest(
        request,
        solicitud.id,
        decision
      );

      setPending((current) =>
        current.filter(
          (item) => String(item.id) !== String(solicitud.id)
        )
      );

      if (decision === "aprobar") {
        if (result?.entrega === "enviado") {
          setReviewMessage(
            `Solicitud #${solicitud.id} aprobada. ` +
            "El servicio de correo procesó la invitación."
          );
        } else if (result?.entrega === "fallido") {
          setReviewMessage(
            `Solicitud #${solicitud.id} aprobada, ` +
            "pero el envío del correo falló. " +
            "Un administrador deberá gestionar la reemisión."
          );
        } else if (result?.entrega === "no_disponible") {
          setReviewMessage(
            `Solicitud #${solicitud.id} aprobada, ` +
            "pero no se pudo iniciar la entrega. " +
            "Requiere revisión administrativa."
          );
        } else {
          // Modo laboratorio TEST.
          setReviewMessage(
            `Solicitud #${solicitud.id} aprobada.`
          );
        }

        // Solo existe en el laboratorio cuando la API
        // devuelve expresamente el token temporal.
        if (result?.invitacion?.token) {
          setDevInvitation({
            solicitudId: solicitud.id,
            correo: solicitud.correo_invitado,
            token: result.invitacion.token,
            expiresIn: result.invitacion.expiraEnHoras,
          });
        }

      } else {
        setReviewMessage(
          `Solicitud #${solicitud.id} rechazada.`
        );
      }
    } catch (error) {
      setReviewError(
        error.message || "No se pudo revisar la solicitud."
      );
    } finally {
      setReviewingId(null);
    }
  }

  async function handleAccept(event) {
    event.preventDefault();

    setAcceptLoading(true);
    setAcceptError("");
    setAcceptMessage("");

    try {
      const result = await acceptResidentInvitation(
        request,
        invitationToken
      );

      setAcceptMessage(
        result?.message ||
          "Invitación aceptada correctamente."
      );
      setInvitationToken("");
    } catch (error) {
      setAcceptError(
        error.message || "No se pudo aceptar la invitación."
      );
    } finally {
      setAcceptLoading(false);
    }
  }

  return (
    <div className="invitation-page">
      <header className="invitation-topbar">
        <Link to="/dashboard" className="detail-brand">
          <Building2 size={25} />
          <span>AdminCond</span>
        </Link>

        <Link to="/dashboard" className="back-link">
          <ArrowLeft size={18} />
          Volver al dashboard
        </Link>
      </header>

      <main className="invitation-container">
        <div className="invitation-heading">
          <span className="section-kicker">
            GESTIÓN DE RESIDENTES
          </span>

          <h1>Invitaciones y solicitudes</h1>

          <p>
            Solicita nuevos residentes, revisa solicitudes
            autorizadas y acepta invitaciones para tu cuenta.
          </p>

          <div className="invitation-user">
            <ShieldCheck size={17} />
            Sesión de {user?.nombre || user?.correo}
          </div>
        </div>

        <div className="invitation-layout">
          <div className="invitation-column">
            <section className="invitation-card">
              <div className="invitation-card-heading">
                <span className="invitation-icon">
                  <UserRoundPlus size={22} />
                </span>

                <div>
                  <h2>Solicitar residente</h2>
                  <p>
                    Solo el responsable principal puede
                    solicitar personas para su unidad.
                  </p>
                </div>
              </div>

              {unitsLoading ? (
                <p className="invitation-muted">
                  Cargando tus unidades...
                </p>
              ) : unitsError ? (
                <p className="invitation-error" role="alert">
                  {unitsError}
                </p>
              ) : units.length === 0 ? (
                <p className="invitation-muted">
                  No tienes unidades donde seas responsable
                  principal activo.
                </p>
              ) : (
                <form
                  className="invitation-form"
                  onSubmit={handleCreateRequest}
                >
                  <label htmlFor="invitation-unit">
                    Unidad
                  </label>

                  <select
                    id="invitation-unit"
                    value={selectedUnit}
                    onChange={(event) =>
                      setSelectedUnit(event.target.value)
                    }
                    required
                  >
                    <option value="">Seleccionar unidad</option>

                    {units.map((unit) => (
                      <option
                        key={String(unit.id)}
                        value={String(unit.id)}
                      >
                        {unit.condominio} — {unit.codigo}
                      </option>
                    ))}
                  </select>

                  <label htmlFor="invitation-email">
                    Correo de la persona invitada
                  </label>

                  <div className="invitation-input">
                    <Mail size={18} />
                    <input
                      id="invitation-email"
                      type="email"
                      placeholder="residente@ejemplo.com"
                      autoComplete="off"
                      maxLength={254}
                      value={email}
                      onChange={(event) =>
                        setEmail(event.target.value)
                      }
                      required
                    />
                  </div>

                  <p className="invitation-hint">
                    Por ahora la persona debe tener una
                    cuenta activa en AdminCond.
                  </p>

                  <button
                    className="primary-button"
                    type="submit"
                    disabled={requestLoading}
                  >
                    {requestLoading
                      ? "Registrando..."
                      : "Enviar solicitud"}
                    {!requestLoading && <Send size={18} />}
                  </button>

                  {requestMessage && (
                    <p className="invitation-success" role="status">
                      {requestMessage}
                    </p>
                  )}

                  {requestError && (
                    <p className="invitation-error" role="alert">
                      {requestError}
                    </p>
                  )}
                </form>
              )}
            </section>

            <section className="invitation-card">
              <div className="invitation-card-heading">
                <span className="invitation-icon">
                  <KeyRound size={22} />
                </span>

                <div>
                  <h2>Aceptar invitación</h2>
                  <p>
                    Usa el token recibido para vincular
                    tu cuenta a la unidad.
                  </p>
                </div>
              </div>

              <form
                className="invitation-form"
                onSubmit={handleAccept}
              >
                <label htmlFor="invitation-token">
                  Token de invitación
                </label>

                <textarea
                  id="invitation-token"
                  rows={3}
                  className="invitation-token-input"
                  placeholder="Pega aquí el token de invitación"
                  autoComplete="off"
                  spellCheck={false}
                  minLength={20}
                  maxLength={512}
                  value={invitationToken}
                  onChange={(event) =>
                    setInvitationToken(event.target.value)
                  }
                  required
                />

                <p className="invitation-hint">
                  Solo la cuenta cuyo correo fue invitado
                  puede aceptar. El token caduca después
                  de 48 horas.
                </p>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={acceptLoading}
                >
                  {acceptLoading
                    ? "Aceptando..."
                    : "Aceptar invitación"}
                  {!acceptLoading && <Check size={18} />}
                </button>

                {acceptMessage && (
                  <p className="invitation-success" role="status">
                    {acceptMessage}
                  </p>
                )}

                {acceptError && (
                  <p className="invitation-error" role="alert">
                    {acceptError}
                  </p>
                )}
              </form>
            </section>
          </div>

          <section className="invitation-card invitation-pending">
            <div className="invitation-pending-header">
              <div className="invitation-card-heading">
                <span className="invitation-icon">
                  <ClipboardCheck size={22} />
                </span>

                <div>
                  <h2>Solicitudes pendientes</h2>
                  <p>
                    Solo los administradores autorizados
                    pueden revisar solicitudes.
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="refresh-button"
                disabled={pendingLoading}
                onClick={handleRefreshPending}
              >
                <RefreshCw size={16} />
                Actualizar
              </button>
            </div>

            {reviewMessage && (
              <p className="invitation-success" role="status">
                {reviewMessage}
              </p>
            )}

            {reviewError && (
              <p className="invitation-error" role="alert">
                {reviewError}
              </p>
            )}

            {devInvitation && (
              <div className="invitation-dev-token">
                <strong>
                  Token temporal de laboratorio
                </strong>

                <p>
                  Solicitud #{devInvitation.solicitudId} —
                  destino: {devInvitation.correo}
                </p>

                <textarea
                  readOnly
                  aria-label="Token de invitación de laboratorio"
                  value={devInvitation.token}
                  rows={3}
                  spellCheck={false}
                />

                <p>
                  Válido durante {devInvitation.expiresIn}
                  horas. Transfiérelo únicamente a la
                  cuenta de prueba invitada. No lo publiques
                  ni lo guardes en GitHub.
                </p>

                <button
                  type="button"
                  className="invitation-clear-button"
                  onClick={() => setDevInvitation(null)}
                >
                  Ocultar token
                </button>
              </div>
            )}

            {pendingLoading ? (
              <div className="invitation-empty">
                <LoaderCircle className="spin" size={24} />
                <p>Consultando solicitudes...</p>
              </div>
            ) : pendingError ? (
              <p className="invitation-error" role="alert">
                {pendingError}
              </p>
            ) : pending.length === 0 ? (
              <div className="invitation-empty">
                <Clock3 size={28} />
                <h3>Sin solicitudes pendientes</h3>
                <p>
                  No hay solicitudes disponibles para
                  revisión con tu cuenta.
                </p>
              </div>
            ) : (
              <div className="invitation-request-list">
                {pending.map((solicitud) => (
                  <article
                    className="invitation-request-item"
                    key={String(solicitud.id)}
                  >
                    <div className="invitation-request-top">
                      <strong>
                        Solicitud #{solicitud.id}
                      </strong>
                      <span className="condominium-status">
                        {solicitud.estado}
                      </span>
                    </div>

                    <p>
                      <strong>Correo:</strong>{" "}
                      {solicitud.correo_invitado}
                    </p>

                    <p>
                      <strong>Unidad:</strong>{" "}
                      {solicitud.unidad_id}
                    </p>

                    <p>
                      <strong>Condominio:</strong>{" "}
                      {solicitud.condominio_id}
                    </p>

                    <p className="invitation-date">
                      <Clock3 size={15} />
                      {formatDate(solicitud.creada_en)}
                    </p>

                    <div className="invitation-actions">
                      <button
                        type="button"
                        className="invitation-approve"
                        disabled={reviewingId !== null}
                        onClick={() =>
                          handleReview(solicitud, "aprobar")
                        }
                      >
                        <Check size={16} />
                        {reviewingId === String(solicitud.id)
                          ? "Procesando..."
                          : "Aprobar"}
                      </button>

                      <button
                        type="button"
                        className="invitation-reject"
                        disabled={reviewingId !== null}
                        onClick={() =>
                          handleReview(solicitud, "rechazar")
                        }
                      >
                        <X size={16} />
                        Rechazar
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
