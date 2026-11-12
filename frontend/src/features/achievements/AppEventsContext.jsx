import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as UserApi from "../../api/api-user.js";
import { AchievementToast } from "../../components/AchievementToast.jsx";

/** Espera antes de enviar (junta vários toques num envio só) e espera máxima com toques seguidos. */
const FLUSH_DELAY_MS = 1500;
const FLUSH_MAX_WAIT_MS = 5000;
/** Limites do servidor por envio (service-app-events.js). */
const MAX_COUNT_PER_EVENT = 50;
const MAX_EVENTS = 30;

const NO_OP = { track: () => {}, trackSignView: () => {} };
const AppEventsContext = createContext(NO_OP);

/** Monta a lista do envio: contagens em pedaços de até 50 e os sinais vistos; no máximo 30 itens. */
function buildEvents(counts, signs) {
  const events = [];
  for (const [type, total] of counts) {
    for (let left = total; left > 0; left -= MAX_COUNT_PER_EVENT) events.push({ type, count: Math.min(left, MAX_COUNT_PER_EVENT) });
  }
  for (const sign of signs) events.push({ type: "sign_view", sign });
  return events.slice(0, MAX_EVENTS);
}

/**
 * Registra ações do app que valem conquista (toques em ícones, sinais abertos no dicionário, perguntas ao
 * assistente...) e mostra, em qualquer tela, o aviso das conquistas que elas desbloqueiam.
 * Junta as ações e envia de uma vez (POST /profile/events) depois de 1,5 s sem ação nova (no máximo a cada 5 s) e
 * ao sair do app. Falha de rede: as ações daquele envio são descartadas (é só decoração de conquista).
 * Usado por: App.jsx (só com a pessoa logada).
 */
export function AppEventsProvider({ children }) {
  const pending = useRef({ counts: new Map(), signs: new Set() });
  const sentSigns = useRef(new Set());
  const timer = useRef(null);
  const firstPendingAt = useRef(0);
  const [toasts, setToasts] = useState([]);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    const { counts, signs } = pending.current;
    if (counts.size === 0 && signs.size === 0) return;
    const events = buildEvents(counts, signs);
    pending.current = { counts: new Map(), signs: new Set() };
    firstPendingAt.current = 0;
    UserApi.sendAppEvents(events)
      .then(({ newAchievements }) => {
        if (!newAchievements?.length) return;
        setToasts((current) => [...current, ...newAchievements.map((achievement) => ({
          id: `achievement-${achievement.id}`,
          kind: "achievement",
          title: achievement.title,
          appearance: achievement.appearance,
          rarity: achievement.rarity,
        }))]);
      })
      .catch(() => {});
  }, []);

  const schedule = useCallback(() => {
    const now = Date.now();
    if (!firstPendingAt.current) firstPendingAt.current = now;
    clearTimeout(timer.current);
    const waited = now - firstPendingAt.current;
    timer.current = setTimeout(flush, Math.max(0, Math.min(FLUSH_DELAY_MS, FLUSH_MAX_WAIT_MS - waited)));
  }, [flush]);

  const track = useCallback((type, count = 1) => {
    const { counts } = pending.current;
    counts.set(type, (counts.get(type) ?? 0) + count);
    schedule();
  }, [schedule]);

  const trackSignView = useCallback((slug) => {
    if (!slug || sentSigns.current.has(slug)) return;
    sentSigns.current.add(slug);
    pending.current.signs.add(slug);
    schedule();
  }, [schedule]);

  // Envia o que ficou pendente ao sair do app (segundo plano) e ao deslogar (desmontar).
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [flush]);

  const value = useMemo(() => ({ track, trackSignView }), [track, trackSignView]);
  return (
    <AppEventsContext.Provider value={value}>
      {children}
      <AchievementToast items={toasts} />
    </AppEventsContext.Provider>
  );
}

/**
 * @returns {{track: (type: string, count?: number) => void, trackSignView: (slug: string) => void}}
 * Tipos de track: tap_logo, tap_flame, tap_xp, assistant_message, camera_open, ranking_open, theme_change
 * (lista do servidor em config/achievement-metrics.js). Fora do provedor (deslogado), não faz nada.
 */
export function useAppEvents() {
  return useContext(AppEventsContext);
}

/**
 * Conta uma ação quando a tela abre (uma vez por visita; o ref evita contar duas vezes no modo estrito do React).
 * @param {string} type - ex.: "camera_open", "ranking_open".
 */
export function useTrackOnMount(type) {
  const { track } = useAppEvents();
  const counted = useRef(false);
  useEffect(() => {
    if (counted.current) return;
    counted.current = true;
    track(type);
  }, [track, type]);
}
