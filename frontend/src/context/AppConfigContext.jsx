import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as ContentApi from "../api/api-content.js";

/**
 * Textos e regras usados quando o servidor ainda não respondeu (ou está fora do ar): os mesmos valores padrão
 * do servidor (server/src/config/setting-definitions.js). Assim o app nunca fica sem texto.
 */
const FALLBACK_SETTINGS = Object.freeze({
  "progress.minScoreToPass": 70,
  // Reserva curta: a lista completa (editável no painel) vem de /app-config.
  "app.feedback.correctPhrases": [
    { title: "Boa Baby !!", text: "você conseguiu acertar de primeira" },
    { title: "Mandou bem!", text: "suas mãos estão ficando fluentes" },
    { title: "Isso aí!", text: "mais um sinal para a sua coleção" },
    { title: "Na mosca!", text: "você leu o sinal direitinho" },
  ],
  "app.feedback.wrongPhrases": [
    { title: "Talvez na próxima", text: "revise mais os conceitos e refaça, melhore" },
    { title: "Quase lá!", text: "olhe de novo o formato da mão" },
    { title: "Não foi dessa vez", text: "errar faz parte de aprender" },
    { title: "Faltou pouco!", text: "preste atenção no movimento das mãos" },
  ],
});

/** De quanto em quanto tempo o app pergunta de novo por eventos e textos (com a tela visível). */
const REFRESH_INTERVAL_MS = 60 * 1000;
/** Recalcula se o evento ainda vale (ele pode terminar enquanto a tela está aberta). */
const CLOCK_TICK_MS = 15 * 1000;

const AppConfigContext = createContext(null);

/** Última frase sorteada de cada tipo (para não repetir a mesma duas vezes seguidas). */
const lastPhrase = { correct: null, wrong: null };

/**
 * Sorteia uma frase da lista, evitando repetir a anterior.
 * @param {{title: string, text: string}[]} phrases
 * @param {"correct"|"wrong"} kind
 * @returns {{title: string, text: string}}
 */
function drawPhrase(phrases, kind) {
  const options = phrases.length > 1 ? phrases.filter((phrase) => phrase.title !== lastPhrase[kind]?.title) : phrases;
  const phrase = options[Math.floor(Math.random() * options.length)];
  lastPhrase[kind] = phrase;
  return phrase;
}

/**
 * Maior evento de multiplicador de XP valendo no instante "now" (eventos não se somam: vale o maior).
 * @param {object[]} events
 * @param {number} now
 * @returns {object|null}
 */
function pickXpEvent(events, now) {
  return events
    .filter((event) => event.type === "xp_multiplier" && new Date(event.startsAt) <= now && new Date(event.endsAt) > now)
    .reduce((best, event) => (!best || event.multiplier > best.multiplier ? event : best), null);
}

/**
 * Configuração dinâmica do app, editada no painel do servidor (chega pelo backend, sem APK novo):
 * textos (GET /app-config), tabela de níveis e eventos de XP ativos (GET /events/active).
 * Falhas são silenciosas: o app segue com os textos padrão e sem faixa de evento.
 */
export function AppConfigProvider({ children }) {
  const [settings, setSettings] = useState(FALLBACK_SETTINGS);
  const [levels, setLevels] = useState([]);
  const [events, setEvents] = useState([]);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    const [config, active] = await Promise.allSettled([ContentApi.fetchAppConfig(), ContentApi.fetchActiveEvents()]);
    if (config.status === "fulfilled") {
      setSettings({ ...FALLBACK_SETTINGS, ...config.value.settings });
      setLevels(config.value.levels ?? []);
    }
    if (active.status === "fulfilled") setEvents(active.value.events ?? []);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    refresh();
    const refreshWhenVisible = () => document.visibilityState === "visible" && refresh();
    const refreshTimer = setInterval(refreshWhenVisible, REFRESH_INTERVAL_MS);
    const clockTimer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      clearInterval(refreshTimer);
      clearInterval(clockTimer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({
      text: (key) => String(settings[key] ?? FALLBACK_SETTINGS[key] ?? ""),
      pickFeedbackPhrase: (correct) => {
        const key = correct ? "app.feedback.correctPhrases" : "app.feedback.wrongPhrases";
        const list = Array.isArray(settings[key]) && settings[key].length > 0 ? settings[key] : FALLBACK_SETTINGS[key];
        return drawPhrase(list, correct ? "correct" : "wrong");
      },
      minScoreToPass: Number(settings["progress.minScoreToPass"] ?? FALLBACK_SETTINGS["progress.minScoreToPass"]),
      levels,
      xpEvent: pickXpEvent(events, now),
      refresh,
    }),
    [settings, levels, events, now, refresh],
  );
  return <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>;
}

/**
 * @returns {{text: (key: string) => string, pickFeedbackPhrase: (correct: boolean) => {title: string, text: string},
 *   minScoreToPass: number, levels: object[], xpEvent: object|null, refresh: () => Promise<void>}}
 * pickFeedbackPhrase(acertou) sorteia a frase da folha de resposta; xpEvent = evento de XP valendo agora (ou null).
 * Usado por: TrailPage e ActivityPage (faixa de evento), FeedbackSheet (textos), ActivityResult (nota mínima).
 */
export function useAppConfig() {
  const context = useContext(AppConfigContext);
  if (!context) throw new Error("useAppConfig precisa estar dentro de <AppConfigProvider>");
  return context;
}
