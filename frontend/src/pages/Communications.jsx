
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  LoaderCircle,
  Megaphone,
  RefreshCw,
  Send,
  X,
} from "lucide-react";

import { useAuth } from "../context/useAuth";
import { getMyCondominiums } from "../services/condominiums";
import {
  getCommunications,
  getCommunicationDetail,
  publishCommunication,
} from "../services/communications";

import "./Communications.css";

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

export default function Communications() {
  const { request } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedCondominiumId = searchParams.get("condominioId");

  const [condominiums, setCondominiums] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [communications, setCommunications] = useState([]);

  const [loadingCondominiums, setLoadingCondominiums] =
    useState(true);
  const [loadingCommunications, setLoadingCommunications] =
    useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [formError, setFormError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [success, setSuccess] = useState("");

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [detail, setDetail] = useState(null);

  const selectedCondominium = condominiums.find(
    (condo) => String(condo.id) === String(selectedId)
  );

  const canPublish =
    selectedCondominium?.puede_publicar === true;

  // Cargar únicamente condominios autorizados.
  useEffect(() => {
    let active = true;

    async function loadCondominiums() {
      try {
        const result = await getMyCondominiums(request);

        if (!active) return;

        setCondominiums(result);
        const authorizedCondominium = result.find(
          (condo) =>
            String(condo.id) === requestedCondominiumId
        );

        setSelectedId(
          result.length > 0
            ? String(authorizedCondominium?.id ?? result[0].id)
            : ""
        );
      } catch (err) {
        if (active) {
          setError(
            err.message ||
              "No fue posible cargar tus condominios."
          );
        }
      } finally {
        if (active) {
          setLoadingCondominiums(false);
        }
      }
    }

    loadCondominiums();

    return () => {
      active = false;
    };
  }, [request, requestedCondominiumId]);

  // Actualizar comunicados al cambiar de condominio.
  useEffect(() => {
    if (!selectedId) {
      return;
    }

    let active = true;

    async function loadCommunications() {
      setLoadingCommunications(true);
      setListError("");
      setCommunications([]);

      try {
        const result = await getCommunications(
          request,
          selectedId
        );

        if (active) {
          setCommunications(result);
        }
      } catch (err) {
        if (active) {
          setListError(
            err.message ||
              "No fue posible consultar los comunicados."
          );
        }
      } finally {
        if (active) {
          setLoadingCommunications(false);
        }
      }
    }

    loadCommunications();

    return () => {
      active = false;
    };
  }, [request, selectedId]);

  function handleCondominiumChange(event) {
    setSelectedId(event.target.value);
    setSuccess("");
    setFormError("");
    setDetailError("");
    setDetail(null);
    setTitle("");
    setContent("");
  }

  async function handleRefresh() {
    if (!selectedId || loadingCommunications) return;

    setLoadingCommunications(true);
    setListError("");
    setSuccess("");

    try {
      const result = await getCommunications(
        request,
        selectedId
      );

      setCommunications(result);
    } catch (err) {
      setListError(
        err.message || "No se pudieron actualizar los avisos."
      );
    } finally {
      setLoadingCommunications(false);
    }
  }

  async function handlePublish(event) {
    event.preventDefault();

    if (!canPublish || publishing) return;

    const targetCondominium = selectedId;

    setPublishing(true);
    setFormError("");
    setSuccess("");

    try {
      await publishCommunication(request, {
        condominioId: targetCondominium,
        titulo: title,
        contenido: content,
      });

      setTitle("");
      setContent("");
      setSuccess("Comunicado publicado correctamente.");

      const updated = await getCommunications(
        request,
        targetCondominium
      );

      if (String(targetCondominium) === String(selectedId)) {
        setCommunications(updated);
        setListError("");
      }
    } catch (err) {
      setFormError(
        err.message || "No se pudo publicar el comunicado."
      );
    } finally {
      setPublishing(false);
    }
  }

  async function handleOpenDetail(communicationId) {
    setDetail(null);
    setDetailError("");
    setLoadingDetail(true);

    try {
      const result = await getCommunicationDetail(
        request,
        communicationId
      );

      setDetail(result);
    } catch (err) {
      setDetailError(
        err.message ||
          "No fue posible consultar el detalle."
      );
    } finally {
      setLoadingDetail(false);
    }
  }

  return (
    <div className="communications-page">
      <div className="communications-container">
        <header className="communications-header">
          <Link
            to="/dashboard"
            className="communications-back"
          >
            <ArrowLeft size={17} />
            Volver al dashboard
          </Link>

          <div className="communications-heading">
            <div className="communications-heading-icon">
              <Megaphone size={29} />
            </div>
            <div>
              <span className="communications-kicker">
                ADMINCOND · COMUNIDAD
              </span>
              <h1>Comunicados</h1>
              <p>
                Mantente al día con los avisos de tu
                condominio.
              </p>
            </div>
          </div>
        </header>

        {error && (
          <div
            className="communications-alert error"
            role="alert"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            className="communications-alert success"
            role="status"
          >
            <CheckCircle2 size={19} />
            {success}
          </div>
        )}

        <section className="communications-panel">
          <div className="communications-section-title">
            <Building2 size={20} />
            <h2>Seleccionar condominio</h2>
          </div>

          {loadingCondominiums ? (
            <p className="communications-muted">
              <LoaderCircle
                size={17}
                className="communications-spin"
              />
              Cargando condominios...
            </p>
          ) : condominiums.length === 0 ? (
            <p className="communications-muted">
              No tienes condominios disponibles.
            </p>
          ) : (
            <div className="communications-selector-row">
              <select
                id="communications-condominium"
                aria-label="Condominio"
                value={selectedId}
                onChange={handleCondominiumChange}
                disabled={publishing}
                className="communications-select"
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

              <span className="communications-role">
                {canPublish
                  ? "Puedes publicar avisos"
                  : "Consulta de avisos"}
              </span>
            </div>
          )}
        </section>

        {selectedId && (
          <>
            {canPublish && (
              <section className="communications-panel">
                <div className="communications-section-title">
                  <Send size={20} />
                  <h2>Publicar comunicado</h2>
                </div>

                <p className="communications-muted">
                  El aviso será visible para los usuarios
                  autorizados de este condominio.
                </p>

                <form
                  onSubmit={handlePublish}
                  className="communications-form"
                >
                  <label htmlFor="communication-title">
                    Título
                  </label>
                  <input
                    id="communication-title"
                    type="text"
                    maxLength={150}
                    required
                    value={title}
                    onChange={(event) =>
                      setTitle(event.target.value)
                    }
                    placeholder="Ej. Mantenimiento del ascensor"
                    disabled={publishing}
                  />
                  <span className="communications-counter">
                    {title.length}/150
                  </span>

                  <label htmlFor="communication-content">
                    Contenido
                  </label>
                  <textarea
                    id="communication-content"
                    rows={6}
                    maxLength={5000}
                    required
                    value={content}
                    onChange={(event) =>
                      setContent(event.target.value)
                    }
                    placeholder="Escribe aquí el aviso..."
                    disabled={publishing}
                  />
                  <span className="communications-counter">
                    {content.length}/5000
                  </span>

                  {formError && (
                    <div
                      className="communications-alert error"
                      role="alert"
                    >
                      {formError}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="communications-primary-button"
                    disabled={
                      publishing ||
                      !title.trim() ||
                      !content.trim()
                    }
                  >
                    {publishing ? (
                      <>
                        <LoaderCircle
                          size={17}
                          className="communications-spin"
                        />
                        Publicando...
                      </>
                    ) : (
                      <>
                        <Send size={17} />
                        Publicar comunicado
                      </>
                    )}
                  </button>
                </form>
              </section>
            )}

            <section className="communications-panel">
              <div className="communications-list-heading">
                <div className="communications-section-title">
                  <Bell size={20} />
                  <h2>Avisos publicados</h2>
                </div>

                <button
                  type="button"
                  className="communications-refresh"
                  onClick={handleRefresh}
                  disabled={loadingCommunications}
                >
                  <RefreshCw size={16} />
                  Actualizar
                </button>
              </div>

              {listError && (
                <div
                  className="communications-alert error"
                  role="alert"
                >
                  {listError}
                </div>
              )}

              {loadingCommunications ? (
                <p className="communications-muted">
                  <LoaderCircle
                    size={17}
                    className="communications-spin"
                  />
                  Cargando avisos...
                </p>
              ) : communications.length === 0 ? (
                <div className="communications-empty">
                  <Megaphone size={31} />
                  <h3>No hay comunicados publicados</h3>
                  <p>
                    Los avisos aparecerán aquí cuando el
                    administrador los publique.
                  </p>
                </div>
              ) : (
                <div className="communications-list">
                  {communications.map((item) => (
                    <article
                      key={String(item.id)}
                      className="communications-card"
                    >
                      <div className="communications-card-top">
                        <h3>{item.titulo}</h3>
                        <span className="communications-tag">
                          Publicado
                        </span>
                      </div>

                      <p className="communications-preview">
                        {item.contenido}
                      </p>

                      <div className="communications-card-footer">
                        <span>
                          <CalendarDays size={15} />
                          {formatDate(item.creado_en)}
                        </span>
                        <span>
                          Por {item.autor_nombre || "Administrador"}
                        </span>
                      </div>

                      <button
                        type="button"
                        className="communications-detail-button"
                        onClick={() => handleOpenDetail(item.id)}
                        disabled={loadingDetail}
                      >
                        Ver detalle
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {(detail || loadingDetail || detailError) && (
              <section className="communications-panel">
                <div className="communications-list-heading">
                  <div className="communications-section-title">
                    <Megaphone size={20} />
                    <h2>Detalle del comunicado</h2>
                  </div>
                  <button
                    type="button"
                    className="communications-icon-button"
                    aria-label="Cerrar detalle"
                    onClick={() => {
                      setDetail(null);
                      setDetailError("");
                      setLoadingDetail(false);
                    }}
                  >
                    <X size={19} />
                  </button>
                </div>

                {loadingDetail ? (
                  <p className="communications-muted">
                    Cargando detalle...
                  </p>
                ) : detailError ? (
                  <div
                    className="communications-alert error"
                    role="alert"
                  >
                    {detailError}
                  </div>
                ) : detail ? (
                  <>
                    <h3>{detail.titulo}</h3>
                    <p className="communications-detail-content">
                      {detail.contenido}
                    </p>
                    <p className="communications-muted">
                      Publicado por{" "}
                      {detail.autor_nombre || "Administrador"}{" "}
                      · {formatDate(detail.creado_en)}
                    </p>
                  </>
                ) : null}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
