import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, setUnauthorizedHandler } from "./api.js";

const AuthContext = createContext(null);

/**
 * Guarda quem está logado no painel ({admin, permissions}) e oferece login/logout.
 * Ao abrir, pergunta ao servidor (GET /auth/me) se o cookie de sessão ainda vale.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => setSession(null));
    api("/auth/me")
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setChecking(false));
  }, []);

  const login = useCallback(async (email, password) => {
    setSession(await api("/auth/login", { method: "POST", body: { email, password } }));
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      setSession(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      admin: session?.admin ?? null,
      can: (action) => Boolean(session?.permissions?.[action]),
      checking,
      login,
      logout,
    }),
    [session, checking, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * @returns {{admin: object|null, can: (action: "read"|"content"|"manage"|"admins") => boolean,
 *   checking: boolean, login: Function, logout: Function}}
 */
export function useAuth() {
  return useContext(AuthContext);
}
