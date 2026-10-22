
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";

import { getMyClients } from "../services/clients";
import { getCondominiumContext } from "../services/condominiums";
import { useAuth } from "../context/useAuth";

export default function ContextSelector({
  condominiums,
  loading,
  onContextChange,
}) {
  const { request } = useAuth();

  // Clientes
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsError, setClientsError] = useState("");

  // Selección del usuario
  const [clientId, setClientId] = useState("");
  const [condominiumId, setCondominiumId] = useState("");

  // Contexto autorizado
  const [context, setContext] = useState(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState("");

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

  // 2. Determinar cliente seleccionado
  const selectedClientId = clients.some(
    (client) => String(client.id) === clientId
  )
    ? clientId
    : String(clients[0]?.id ?? "");

  const selectedClient = clients.find(
    (client) => String(client.id) === selectedClientId
  );

  // 3. Filtrar condominios del cliente seleccionado
  const availableCondominiums = condominiums.filter(
    (condo) => String(condo.cliente_id) === selectedClientId
  );

  const selectedCondominiumId = availableCondominiums.some(
    (condo) => String(condo.id) === condominiumId
  )
    ? condominiumId
    : String(availableCondominiums[0]?.id ?? "");

  const selectedCondominium = availableCondominiums.find(
    (condo) => String(condo.id) === selectedCondominiumId
  );

  // 4. Consultar contexto autorizado del condominio
  useEffect(() => {
    let active = true;

    async function loadContext() {
      setContext(null);
      setContextError("");

      if (!selectedCondominiumId) {
        setContextLoading(false);
        return;
      }

      setContextLoading(true);

      try {
        const data = await getCondominiumContext(
          request,
          selectedCondominiumId
        );

        if (active) {
          setContext(data);
        }
      } catch (error) {
        if (active) {
          setContextError(
            error.message || "No se pudo cargar el contexto."
          );
        }
      } finally {
        if (active) {
          setContextLoading(false);
        }
      }
    }

    loadContext();

    return () => {
      active = false;
    };
  }, [request, selectedCondominiumId]);

  // 5. Evitar mostrar un contexto de otro condominio
  const currentContext =
    context &&
    String(context.condominioId) === selectedCondominiumId
      ? context
      : null;
      // Compartir el contexto seleccionado con el Dashboard.
      // No se realiza otra petición HTTP.
      useEffect(() => {
      onContextChange?.({
          condominioId: selectedCondominiumId,
          contexto: currentContext,
      });
      }, [onContextChange, selectedCondominiumId, currentContext]);

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
              setClientId(event.target.value);
              setCondominiumId("");
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
              setCondominiumId(event.target.value);
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
