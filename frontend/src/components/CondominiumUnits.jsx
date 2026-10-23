
import { useEffect, useState } from "react";
import {
  AlertCircle,
  Building2,
  ChevronDown,
  ChevronUp,
  House,
  LoaderCircle,
  RefreshCw,
  Users,
} from "lucide-react";

import { useAuth } from "../context/useAuth";
import {
  getCondominiumUnits,
  getMyUnits,
} from "../services/units";
import { getUnitPeople } from "../services/unitPeople";

function getRelationshipLabels(person) {
  const labels = [];

  if (person.es_principal) {
    labels.push("Responsable principal");
  }

  if (person.es_propietario) {
    labels.push("Propietario");
  }

  if (person.es_inquilino) {
    labels.push("Inquilino");
  }

  if (person.es_ocupante) {
    labels.push("Ocupante");
  }

  if (person.responsable_pago) {
    labels.push("Responsable de pago");
  }

  return labels;
}

function UnitPeople({ unitId, request }) {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadPeople() {
      setLoading(true);
      setError("");
      setPeople([]);

      try {
        const result = await getUnitPeople(request, unitId);

        if (active) {
          setPeople(result);
        }
      } catch (err) {
        if (active) {
          setError(
            err.status === 404
              ? "No tienes acceso a las personas de esta unidad."
              : err.message || "No se pudieron cargar las personas."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadPeople();

    return () => {
      active = false;
    };
  }, [request, unitId, reloadKey]);

  if (loading) {
    return (
      <div className="unit-people-message" role="status">
        <LoaderCircle className="spin" size={17} />
        Consultando personas...
      </div>
    );
  }

  if (error) {
    return (
      <div className="unit-people-error" role="alert">
        <AlertCircle size={17} />
        <span>{error}</span>

        <button
          type="button"
          className="refresh-button"
          onClick={() => setReloadKey((current) => current + 1)}
        >
          <RefreshCw size={16} />
          Reintentar
        </button>
      </div>
    );
  }

  if (people.length === 0) {
    return (
      <p className="unit-people-message">
        No hay personas activas vinculadas a esta unidad.
      </p>
    );
  }

  return (
    <div className="unit-people-list">
      {people.map((person) => (
        <div className="unit-person" key={String(person.id)}>
          <span className="unit-person-avatar">
            <Users size={19} />
          </span>

          <div className="unit-person-content">
            <strong>{person.nombre}</strong>

            <div className="unit-relationships">
              {getRelationshipLabels(person).map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CondominiumUnits({ condominiumId }) {
  const { request } = useAuth();

  const [units, setUnits] = useState([]);
  const [viewType, setViewType] = useState("mine");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [expandedUnitId, setExpandedUnitId] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadUnits() {
      try {
        let result;
        let type = "all";

        try {
          result = await getCondominiumUnits(
            request,
            condominiumId
          );
        } catch (adminError) {
          if (adminError.status !== 404) {
            throw adminError;
          }

          const ownUnits = await getMyUnits(request);

          result = ownUnits.filter(
            (unit) =>
              String(unit.condominio_id) ===
              String(condominiumId)
          );

          type = "mine";
        }

        if (active) {
          setUnits(result);
          setViewType(type);
          setExpandedUnitId(null);
          setError("");
        }
      } catch (err) {
        if (active) {
          setError(
            err.message || "No se pudieron cargar las unidades."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadUnits();

    return () => {
      active = false;
    };
  }, [condominiumId, request, reloadKey]);

  function handleRefresh() {
    setLoading(true);
    setError("");
    setExpandedUnitId(null);
    setReloadKey((value) => value + 1);
  }

  function togglePeople(unitId) {
    setExpandedUnitId((previous) =>
      String(previous) === String(unitId) ? null : unitId
    );
  }

  return (
    <section className="section units-section">
      <div className="section-heading section-heading-row">
        <div>
          <h2>
            {viewType === "all"
              ? "Unidades del condominio"
              : "Mis unidades"}
          </h2>

          <p>
            {viewType === "all"
              ? "Unidades activas que puedes administrar."
              : "Unidades vinculadas a tu cuenta."}
          </p>
        </div>

        <button
          type="button"
          className="refresh-button"
          onClick={handleRefresh}
          disabled={loading}
        >
          <RefreshCw size={16} />
          Actualizar
        </button>
      </div>

      {loading ? (
        <div className="data-state" role="status">
          <LoaderCircle className="spin" size={26} />
          <h3>Cargando unidades...</h3>
          <p>Consultando los datos autorizados.</p>
        </div>
      ) : error ? (
        <div className="data-state error-state" role="alert">
          <AlertCircle size={26} />
          <h3>No se pudieron cargar las unidades</h3>
          <p>{error}</p>

          <button
            type="button"
            className="refresh-button"
            onClick={handleRefresh}
          >
            Reintentar
          </button>
        </div>
      ) : units.length === 0 ? (
        <div className="data-state">
          <Building2 size={30} />
          <h3>No hay unidades disponibles</h3>
          <p>
            {viewType === "all"
              ? "Este condominio todavía no tiene unidades activas."
              : "No tienes unidades activas vinculadas aquí."}
          </p>
        </div>
      ) : (
        <>
          <p className="result-count">
            {units.length}{" "}
            {units.length === 1
              ? "unidad disponible"
              : "unidades disponibles"}
          </p>

          <div className="units-grid">
            {units.map((unit) => {
              const expanded =
                String(expandedUnitId) === String(unit.id);

              const relationships =
                viewType === "mine"
                  ? getRelationshipLabels(unit)
                  : [];

              return (
                <article
                  className="unit-card"
                  key={String(unit.id)}
                >
                  <div className="unit-card-header">
                    <span className="module-icon">
                      <House size={22} />
                    </span>

                    <span className="condominium-status">
                      {unit.estado || "Activa"}
                    </span>
                  </div>

                  <h3>Unidad {unit.codigo}</h3>

                  <p>
                    Tipo:{" "}
                    <strong>
                      {unit.tipo || "Sin especificar"}
                    </strong>
                  </p>

                  {viewType === "mine" &&
                    relationships.length > 0 && (
                      <div className="unit-relationships">
                        {relationships.map((label) => (
                          <span key={label}>{label}</span>
                        ))}
                      </div>
                    )}

                  {viewType === "all" && (
                    <div className="unit-people-section">
                      <button
                        type="button"
                        className="unit-people-button"
                        aria-expanded={expanded}
                        onClick={() => togglePeople(unit.id)}
                      >
                        <span>
                          <Users size={17} />
                          {expanded
                            ? "Ocultar personas"
                            : "Ver personas vinculadas"}
                        </span>

                        {expanded ? (
                          <ChevronUp size={17} />
                        ) : (
                          <ChevronDown size={17} />
                        )}
                      </button>

                      {expanded && (
                        <UnitPeople
                          unitId={unit.id}
                          request={request}
                        />
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
