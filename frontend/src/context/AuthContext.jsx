import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as UserApi from "../api/api-user.js";
import { ACCOUNT_BANNED, onAccountBanned, onUnauthorized } from "../api/http-client.js";
import { readStoredToken, storeToken, clearStoredToken } from "../utils/session-storage.js";
import { clearCache, readCache, writeCache } from "../utils/data-cache.js";

/** Perfil guardado no aparelho (o mesmo de GET /profile): com ele o app abre direto, sem esperar o servidor. */
const cachedUser = () => (readStoredToken() ? readCache("profile")?.user ?? null : null);

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
  // Com sessão e perfil guardados, entra na hora ("signedIn") e confere com o servidor em segundo plano.
  const [user, setUser] = useState(cachedUser);
  const [status, setStatus] = useState(() => (cachedUser() ? "signedIn" : readStoredToken() ? "loading" : "signedOut"));

  const signOut = useCallback(() => {
    clearStoredToken();
    clearCache();
    setUser(null);
    setStatus("signedOut");
  }, []);

  const refreshProfile = useCallback(async () => {
    const profile = await UserApi.fetchProfile();
    writeCache("profile", profile);
    setUser(profile.user);
    setStatus("signedIn");
    return profile;
  }, []);

  // Abriu com o perfil guardado: atualiza em segundo plano. Sessão recusada (401) ou conta banida saem da conta pelos
  // ouvintes abaixo; sem internet ou servidor acordando, continua com o que está guardado.
  useEffect(() => {
    if (cachedUser()) refreshProfile().catch(() => {});
  }, [refreshProfile]);

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
    clearCache(); // dados de outra conta não podem aparecer
    storeToken(session.token);
    setUser(session.user);
    setStatus("signedIn");
    // Guarda o perfil completo já agora: na próxima vez o app abre sem esperar o servidor.
    UserApi.fetchProfile().then((profile) => writeCache("profile", profile)).catch(() => {});
  }, []);

  /** Perfil atualizado na tela (XP e ofensiva depois da atividade, foto...): vale também para o guardado. */
  const updateUser = useCallback((next) => {
    setUser((current) => {
      const value = typeof next === "function" ? next(current) : next;
      const saved = readCache("profile");
      if (saved && value) writeCache("profile", { ...saved, user: { ...saved.user, ...value } });
      return value;
    });
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
    () => ({ user, status, signIn, signInWithGoogle, register, resetPassword, signOut, refreshProfile, retryConnection, setUser: updateUser }),
    [user, status, signIn, signInWithGoogle, register, resetPassword, signOut, refreshProfile, retryConnection, updateUser],
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
