import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as UserApi from "../api/api-user.js";
import { onUnauthorized } from "../api/http-client.js";
import { readStoredToken, storeToken, clearStoredToken } from "../utils/session-storage.js";

const AuthContext = createContext(null);

/**
 * Guarda a sessão (token + perfil). status: loading | signedOut | signedIn | offline.
 * offline = havia sessão salva, mas o servidor não respondeu: o token é mantido para tentar de novo.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(readStoredToken() ? "loading" : "signedOut");

  const signOut = useCallback(() => {
    clearStoredToken();
    setUser(null);
    setStatus("signedOut");
  }, []);

  const refreshProfile = useCallback(async () => {
    const profile = await UserApi.fetchProfile();
    setUser(profile.user);
    setStatus("signedIn");
    return profile;
  }, []);

  useEffect(() => onUnauthorized(signOut), [signOut]);

  // Só sai da conta se o servidor recusar o token (401); queda de rede não desloga ninguém.
  useEffect(() => {
    if (status !== "loading") return;
    refreshProfile().catch((error) => (error.status === 401 ? signOut() : setStatus("offline")));
  }, [status, refreshProfile, signOut]);

  const retryConnection = useCallback(() => setStatus("loading"), []);

  const startSession = useCallback((session) => {
    storeToken(session.token);
    setUser(session.user);
    setStatus("signedIn");
  }, []);

  const signIn = useCallback(async (credentials) => startSession(await UserApi.signInAccount(credentials)), [startSession]);
  const register = useCallback(async (data) => startSession(await UserApi.registerAccount(data)), [startSession]);
  const resetPassword = useCallback(
    async (email, code, password) => startSession(await UserApi.confirmPasswordReset(email, code, password)),
    [startSession],
  );

  const value = useMemo(
    () => ({ user, status, signIn, register, resetPassword, signOut, refreshProfile, retryConnection, setUser }),
    [user, status, signIn, register, resetPassword, signOut, refreshProfile, retryConnection],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Acesso à sessão em qualquer tela.
 * @returns {{user: object|null, status: "loading"|"signedOut"|"signedIn"|"offline", signIn, register, resetPassword, signOut,
 *   refreshProfile, retryConnection, setUser}}
 * resetPassword(email, code, senha) troca a senha com o código e já entra na conta.
 * setUser atualiza o perfil local (ex.: XP e ofensiva depois de uma atividade, sem nova requisição).
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return context;
}
