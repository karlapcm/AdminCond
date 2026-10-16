
import {
  useCallback,
  useRef,
  useState,
} from "react";

import { AuthContext } from "./AuthContextBase";
import { apiRequest } from "../services/api";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  // Los tokens permanecen solamente en memoria.
  const tokensRef = useRef({
    accessToken: null,
    refreshToken: null,
  });

  // Evita renovar dos veces simultáneamente el mismo refresh token.
  const renewalRef = useRef(null);

  const clearSession = useCallback(() => {
    tokensRef.current = {
      accessToken: null,
      refreshToken: null,
    };
    setUser(null);
  }, []);

  const login = useCallback(async (correo, password) => {
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      body: { correo, password },
    });

    if (
      !data?.accessToken ||
      !data?.refreshToken ||
      !data?.user
    ) {
      throw new Error("La respuesta de autenticación es incompleta.");
    }

    tokensRef.current = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    };

    setUser(data.user);
  }, []);

  const renewSession = useCallback(async () => {
    if (renewalRef.current) {
      return renewalRef.current;
    }

    const currentRefreshToken = tokensRef.current.refreshToken;

    if (!currentRefreshToken) {
      throw new Error("La sesión ha terminado.");
    }

    const renewal = (async () => {
      const data = await apiRequest("/api/auth/refresh", {
        method: "POST",
        body: { refreshToken: currentRefreshToken },
      });

      if (!data?.accessToken || !data?.refreshToken) {
        throw new Error("No se pudo renovar la sesión.");
      }

      tokensRef.current = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      };

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

  const request = useCallback(
    async (path, options = {}) => {
      const firstToken = tokensRef.current.accessToken;

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
          // Otra solicitud podría haber renovado ya el token.
          const latestToken = tokensRef.current.accessToken;
          const newToken =
            latestToken !== firstToken
              ? latestToken
              : await renewSession();

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
    const refreshToken = tokensRef.current.refreshToken;

    clearSession();

    if (refreshToken) {
      try {
        await apiRequest("/api/auth/logout", {
          method: "POST",
          body: { refreshToken },
        });
      } catch (error) {
        // Si falla el servidor, se borra igualmente la sesión local.
        // La revocación remota deberá comprobarse posteriormente.
        console.error("No se pudo revocar la sesión:", error.message);
      }
    }
  }, [clearSession]);

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