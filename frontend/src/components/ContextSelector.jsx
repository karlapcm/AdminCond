import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";

import { getMyClients } from "../services/clients";
import { useAuth } from "../context/useAuth";
import { useCondominiumContext } from "../context/useCondominiumContext";

export default function ContextSelector() {
  const { request } = useAuth();

  const {
    condominiums,
    condominiumsLoading: loading,
    selectedCondominiumId,
    selectCondominium,
    context: currentContext,
    contextLoading,
    contextError,
  } = useCondominiumContext();

  // Clientes
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsError, setClientsError] = useState("");

  // Selección del usuario
  const [clientId, setClientId] = useState("");

  // 1. Cargar clientes autorizados
  useEffect(() => {
    let active = true;

    async function loadClients() {
      try {
        const data = await getMyClients(request);

        if (active) {
          setClients(data);
          setClientsError("");
        }
      } catch (error) {
        if (active) {
          setClientsError(
            error.message || "No se pudieron cargar los clientes."
          );
        }
      } finally {
        if (active) {
          setClientsLoading(false);
        }
      }
    }

    loadClients();

    return () => {
      active = false;
    };
  }, [request]);

  const selectedCondominium = condominiums.find(
    (condo) => String(condo.id) === selectedCondominiumId
  );

  const selectedClientId = clients.some(
    (client) => String(client.id) === clientId
  )
    ? clientId
    : String(selectedCondominium?.cliente_id ?? clients[0]?.id ?? "");

  const selectedClient = clients.find(
    (client) => String(client.id) === selectedClientId
  );

  const availableCondominiums = condominiums.filter(
    (condo) => String(condo.cliente_id) === selectedClientId
  );

  // 6. Condiciones orientativas para los accesos visuales
  const isAdministrator =
    currentContext?.rolCondominio === "administrador";

  const hasActiveUnit =
    (currentContext?.unidades.length ?? 0) > 0;

  const isPrincipal =
    currentContext?.unidades.some(
      (unit) => unit.esPrincipal
    ) ?? false;

  return (
    <section
      className="ac-context-section"
      aria-label="Contexto de trabajo"
    >
      {/* ENCABEZADO */}
      <div className="ac-context-heading">
        <Building2 size={20} />

        <div>
          <h2>Tu espacio de trabajo</h2>
          <p>
            Selecciona el cliente y condominio que deseas consultar.
          </p>
        </div>
      </div>

      {/* ERROR AL CARGAR CLIENTES */}
      {clientsError && (
        <p role="alert" className="ac-context-error">
          {clientsError}
        </p>
      )}

      {/* SELECTORES */}
      <div className="ac-context-controls">
        <label>
          <span>Cliente</span>

          <select
            value={selectedClientId}
            disabled={
              clientsLoading || clients.length === 0
            }
            onChange={(event) => {
              const nextClientId = event.target.value;
              setClientId(nextClientId);

              const firstCondominium = condominiums.find(
                (condo) => String(condo.cliente_id) === nextClientId
              );

              if (firstCondominium) {
                selectCondominium(firstCondominium.id);
              }
            }}
          >
            {clients.length === 0 && (
              <option value="">
                {clientsLoading
                  ? "Cargando clientes..."
                  : "Sin clientes"}
              </option>
            )}

            {clients.map((client) => (
              <option
                key={String(client.id)}
                value={String(client.id)}
              >
                {client.nombre}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Condominio</span>

          <select
            value={selectedCondominiumId}
            disabled={
              loading || availableCondominiums.length === 0
            }
            onChange={(event) => {
              selectCondominium(event.target.value);
            }}
          >
            {availableCondominiums.length === 0 && (
              <option value="">
                {loading
                  ? "Cargando..."
                  : "Sin condominios"}
              </option>
            )}

            {availableCondominiums.map((condo) => (
              <option
                key={String(condo.id)}
                value={String(condo.id)}
              >
                {condo.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* CONDOMINIO SELECCIONADO */}
      {selectedCondominium && (
        <>
          <div className="ac-context-footer">
            <span>
              Cliente:{" "}
              <strong>{selectedClient?.nombre}</strong>
            </span>

            <Link
              to={`/condominiums/${encodeURIComponent(
                selectedCondominium.id
              )}`}
            >
              Abrir condominio
              <ChevronRight size={16} />
            </Link>
          </div>

          {/* RESUMEN DE ROLES Y UNIDADES */}
          <div
            className="ac-context-summary"
            aria-live="polite"
          >
            {contextLoading ||
            (!currentContext && !contextError) ? (
              <p>Consultando tus permisos y unidades...</p>
            ) : contextError ? (
              <p
                role="alert"
                className="ac-context-error"
              >
                {contextError}
              </p>
            ) : (
              <>
                <div className="ac-context-summary-title">
                  <ShieldCheck size={18} />
                  <strong>
                    Tu acceso en este condominio
                  </strong>
                </div>

                <p>
                  Rol en cliente:{" "}
                  <strong>
                    {currentContext.rolCliente ||
                      "Sin membresía"}
                  </strong>
                </p>

                <p>
                  Rol en condominio:{" "}
                  <strong>
                    {currentContext.rolCondominio ||
                      "Sin membresía directa"}
                  </strong>
                </p>

                <p>
                  Unidades vinculadas:{" "}
                  <strong>
                    {currentContext.unidades.length}
                  </strong>
                </p>

                {/* UNIDADES DEL USUARIO */}
                {currentContext.unidades.length > 0 && (
                  <ul>
                    {currentContext.unidades.map((unit) => (
                      <li key={String(unit.unidadId)}>
                        {unit.codigo}

                        {unit.esPrincipal &&
                          " · Responsable principal"}

                        {unit.esPropietario &&
                          " · Propietario"}

                        {unit.esInquilino &&
                          " · Inquilino"}

                        {unit.esOcupante &&
                          " · Ocupante"}

                        {unit.responsablePago &&
                          " · Responsable de pago"}
                      </li>
                    ))}
                  </ul>
                )}

                {/* ACCESOS SEGÚN EL CONTEXTO */}
                <div className="ac-context-actions">
                  <strong>Accesos disponibles</strong>

                  <div className="ac-context-action-links">
                    {/* Comunicados */}
                    <Link
                      to={`/communications?condominioId=${encodeURIComponent(
                        selectedCondominiumId
                      )}`}
                    >
                      Comunicados
                    </Link>

                    {/* Reservas */}
                    {(isAdministrator || hasActiveUnit) && (
                      <Link
                        to={`/reservations?condominioId=${encodeURIComponent(
                          selectedCondominiumId
                        )}`}
                      >
                        Reservas
                      </Link>
                    )}

                    {/* Invitaciones */}
                    {(isAdministrator || isPrincipal) && (
                      <Link to="/invitations">
                        Invitaciones
                      </Link>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
