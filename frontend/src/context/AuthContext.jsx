
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { AuthContext } from "./AuthContextBase";
import { apiRequest } from "../services/api";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

  // Solo el access token permanece en memoria.
  // El refresh token está en una cookie HttpOnly.
  const accessTokenRef = useRef(null);

  // Evita renovaciones simultáneas.
  const renewalRef = useRef(null);

  // Evita restaurar dos veces en React StrictMode.
  const restorationStartedRef = useRef(false);

  // Impide que una restauración antigua sobrescriba
  // un login o logout más reciente.
  const sessionVersionRef = useRef(0);

  const clearSession = useCallback(() => {
    sessionVersionRef.current += 1;
    accessTokenRef.current = null;
    setUser(null);
  }, []);

  const renewSession = useCallback(async () => {
    if (renewalRef.current) {
      return renewalRef.current;
    }

    const renewal = (async () => {
      // La cookie HttpOnly se envía automáticamente.
      // No necesitamos leer ni enviar refreshToken.
      const data = await apiRequest("/api/auth/refresh", {
        method: "POST",
      });

      if (!data?.accessToken) {
        throw new Error("No se pudo renovar la sesión.");
      }

      return data.accessToken;
    })();

    renewalRef.current = renewal;

    try {
      return await renewal;
    } finally {
      if (renewalRef.current === renewal) {
        renewalRef.current = null;
      }
    }
  }, []);

  // Restaurar la sesión cuando se carga la aplicación.
  useEffect(() => {
    if (restorationStartedRef.current) {
      return;
    }

    restorationStartedRef.current = true;

    const currentVersion = sessionVersionRef.current;

    async function restoreSession() {
      try {
        const token = await renewSession();

        const data = await apiRequest("/api/auth/me", {
          token,
        });

        if (sessionVersionRef.current !== currentVersion) {
          return;
        }

        if (!data?.user) {
          throw new Error("No se pudo recuperar el usuario.");
        }

        accessTokenRef.current = token;
        setUser(data.user);
      } catch {
        if (sessionVersionRef.current === currentVersion) {
          accessTokenRef.current = null;
          setUser(null);
        }
      } finally {
        setInitializing(false);
      }
    }

    restoreSession();
  }, [renewSession]);

  const login = useCallback(async (correo, password) => {
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      body: { correo, password },
    });

    if (!data?.accessToken || !data?.user) {
      throw new Error(
        "La respuesta de autenticación es incompleta."
      );
    }

    sessionVersionRef.current += 1;
    accessTokenRef.current = data.accessToken;
    setUser(data.user);
  }, []);

  const request = useCallback(
    async (path, options = {}) => {
      const firstToken = accessTokenRef.current;

      if (!firstToken) {
        throw new Error("Debes iniciar sesión.");
      }

      try {
        return await apiRequest(path, {
          ...options,
          token: firstToken,
        });
      } catch (error) {
        if (error.status !== 401) {
          throw error;
        }

        try {
          const latestToken = accessTokenRef.current;

          const newToken =
            latestToken !== firstToken
              ? latestToken
              : await renewSession();

          accessTokenRef.current = newToken;

          return await apiRequest(path, {
            ...options,
            token: newToken,
          });
        } catch (retryError) {
          if (retryError.status === 401) {
            clearSession();
          }

          throw retryError;
        }
      }
    },
    [renewSession, clearSession]
  );

  const logout = useCallback(async () => {
    clearSession();

    try {
      // El backend revoca el refresh token de la cookie
      // y ordena eliminarla del navegador.
      await apiRequest("/api/auth/logout", {
        method: "POST",
      });
    } catch (error) {
      console.error(
        "No se pudo revocar la sesión:",
        error.message
      );
    }
  }, [clearSession]);

  // Evita que ProtectedRoute redirija al login
  // antes de terminar la restauración.
  if (initializing) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
        }}
      >
        Verificando sesión de AdminCond...
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        login,
        request,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
