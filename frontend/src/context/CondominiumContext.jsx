import { useEffect, useState } from "react";

import { CondominiumContext } from "./CondominiumContextBase";
import { useAuth } from "./useAuth";
import {
  getMyCondominiums,
  getCondominiumContext,
} from "../services/condominiums";

export function CondominiumProvider({ children }) {
  const { request } = useAuth();

  const [condominiums, setCondominiums] = useState([]);
  const [requestedId, setRequestedId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectionVersion, setSelectionVersion] = useState(0);

  const [condominiumsState, setCondominiumsState] = useState({
    status: "loading",
    error: "",
  });

  const [contextResult, setContextResult] = useState(null);

  // Consultar los condominios autorizados.
  useEffect(() => {
    let active = true;

    async function loadCondominiums() {
      setCondominiumsState({
        status: "loading",
        error: "",
      });
      try {
        const data = await getMyCondominiums(request);

        if (!active) return;

        setCondominiums(data);
        setCondominiumsState({
          status: "success",
          error: "",
        });
      } catch (error) {
        if (!active) return;

        setCondominiums([]);
        setCondominiumsState({
          status: "error",
          error:
            error.message ||
            "No se pudieron cargar los condominios.",
        });
      }
    }

    loadCondominiums();

    return () => {
      active = false;
    };
  }, [request, refreshKey]);

  // Validar la selección contra los condominios de la API.
  const selectedCondominiumId =
    condominiums.some(
      (condo) => String(condo.id) === requestedId
    )
      ? requestedId
      : String(condominiums[0]?.id ?? "");

  const selectedCondominium = condominiums.find(
    (condo) =>
      String(condo.id) === selectedCondominiumId
  ) ?? null;

  // Obtener membresías y relaciones del contexto seleccionado.
  useEffect(() => {
    if (!selectedCondominiumId) return;

    let active = true;

    async function loadContext() {
      try {
        const data = await getCondominiumContext(
          request,
          selectedCondominiumId
        );

        if (!active) return;

        setContextResult({
          id: selectedCondominiumId,
          refreshKey,
          selectionVersion,
          status: "success",
          data,
          error: "",
        });
      } catch (error) {
        if (!active) return;

        setContextResult({
          id: selectedCondominiumId,
          refreshKey,
          selectionVersion,
          status: "error",
          data: null,
          error:
            error.message ||
            "No se pudo consultar el contexto.",
        });
      }
    }

    loadContext();

    return () => {
      active = false;
    };
  }, [request, selectedCondominiumId, refreshKey, selectionVersion]);

  // Nunca exponer datos de otro condominio seleccionado.
  const currentResult =
    contextResult?.id === selectedCondominiumId &&
    contextResult?.refreshKey === refreshKey &&
    contextResult?.selectionVersion === selectionVersion
      ? contextResult
      : null;

  const context =
    condominiumsState.status === "success" &&
    currentResult?.status === "success"
      ? currentResult.data
      : null;

  function selectCondominium(id) {
    if (condominiumsState.status !== "success") {
      return false;
    }

    const authorized = condominiums.some(
      (condo) => String(condo.id) === String(id)
    );

    if (!authorized) {
      return false;
    }

    if (String(id) !== selectedCondominiumId) {
      setRequestedId(String(id));
      setSelectionVersion((current) => current + 1);
    }

    return true;
  }

  function refreshCondominiums() {
    setRefreshKey((current) => current + 1);
  }

  return (
    <CondominiumContext.Provider
      value={{
        condominiums,
        condominiumsLoading:
          condominiumsState.status === "loading",
        condominiumsError: condominiumsState.error,
        selectedCondominiumId,
        selectedCondominium,
        selectCondominium,
        refreshCondominiums,
        context,
        contextLoading:
          Boolean(selectedCondominiumId) &&
          (condominiumsState.status === "loading" ||
            (!currentResult &&
              condominiumsState.status === "success")),
        contextError: currentResult?.error ?? "",
      }}
    >
      {children}
    </CondominiumContext.Provider>
  );
}
