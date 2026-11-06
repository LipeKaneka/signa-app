import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as UserApi from "../api/api-user.js";
import { ACCOUNT_BANNED, onAccountBanned, onUnauthorized } from "../api/http-client.js";
import { readStoredToken, storeToken, clearStoredToken } from "../utils/session-storage.js";

const AuthContext = createContext(null);

/** Novas tentativas ao abrir o app antes de mostrar "sem conexão" (o servidor grátis pode estar acordando). */
const OFFLINE_RETRIES = 2;
const OFFLINE_RETRY_DELAY_MS = 4000;
/**
 * De quanto em quanto tempo o app confere se a conta continua liberada (só com a tela visível). Assim quem é
 * banido no painel sai da conta mesmo parado numa tela; ao tentar entrar de novo, vê o motivo e o prazo.
 */
const SESSION_CHECK_INTERVAL_MS = 20 * 1000;

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
  // Conta banida: sai da conta e volta para a tela de entrada (o aviso com motivo e prazo aparece ao tentar entrar).
  useEffect(() => onAccountBanned(signOut), [signOut]);

  useEffect(() => {
    if (status !== "signedIn") return undefined;
    // Erros 401/403 já tiram da conta pelos ouvintes acima; queda de rede é ignorada.
    const check = () => document.visibilityState === "visible" && UserApi.checkSession().catch(() => {});
    const timer = setInterval(check, SESSION_CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [status]);

  // Só sai da conta se o servidor recusar o token (401); queda de rede não desloga ninguém.
  // Antes de mostrar "sem conexão", tenta de novo algumas vezes: na hospedagem grátis o servidor pode estar acordando.
  useEffect(() => {
    if (status !== "loading") return undefined;
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt <= OFFLINE_RETRIES; attempt += 1) {
        try {
          await refreshProfile();
          return;
        } catch (error) {
          if (cancelled) return;
          if (error.status === 401 || error.code === ACCOUNT_BANNED) return signOut();
          if (attempt < OFFLINE_RETRIES) await new Promise((resolve) => setTimeout(resolve, OFFLINE_RETRY_DELAY_MS));
          if (cancelled) return;
        }
      }
      setStatus("offline");
    })();
    return () => {
      cancelled = true;
    };
  }, [status, refreshProfile, signOut]);

  const retryConnection = useCallback(() => setStatus("loading"), []);

  const startSession = useCallback((session) => {
    storeToken(session.token);
    setUser(session.user);
    setStatus("signedIn");
  }, []);

  const signIn = useCallback(async (credentials) => startSession(await UserApi.signInAccount(credentials)), [startSession]);
  const signInWithGoogle = useCallback(
    async (idToken) => startSession(await UserApi.signInWithGoogleAccount(idToken)),
    [startSession],
  );
  const register = useCallback(async (data) => startSession(await UserApi.registerAccount(data)), [startSession]);
  const resetPassword = useCallback(
    async (email, code, password) => startSession(await UserApi.confirmPasswordReset(email, code, password)),
    [startSession],
  );

  const value = useMemo(
    () => ({ user, status, signIn, signInWithGoogle, register, resetPassword, signOut, refreshProfile, retryConnection, setUser }),
    [user, status, signIn, signInWithGoogle, register, resetPassword, signOut, refreshProfile, retryConnection],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Acesso à sessão em qualquer tela.
 * @returns {{user: object|null, status: "loading"|"signedOut"|"signedIn"|"offline", signIn, signInWithGoogle, register, resetPassword, signOut,
 *   refreshProfile, retryConnection, setUser}}
 * resetPassword(email, code, senha) troca a senha com o código e já entra na conta.
 * setUser atualiza o perfil local (ex.: XP e ofensiva depois de uma atividade, sem nova requisição).
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return context;
}
