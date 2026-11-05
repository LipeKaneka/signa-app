import { callServer } from "../clients/server-client.js";
import { cachedContent } from "../clients/content-cache.js";

/**
 * Eventos começam/terminam pelo relógio (sem mudar a versão do conteúdo): revalida a cada 5 s. Uma edição no
 * painel (cor, multiplicador) também chega nesse tempo, sem depender da conferência de versão.
 */
const EVENTS_MAX_AGE_MS = 5 * 1000;

/**
 * Eventos valendo agora (ex.: 2x XP), para a faixa de evento no app.
 * @returns {Promise<object[]>} [{id, title, description, type, multiplier, startsAt, endsAt, appearance}] (appearance = cores e estilo da faixa)
 * Usado por: GET /events/active.
 */
export async function listActiveEvents() {
  const { events } = await cachedContent("events:active", () => callServer("/events/active"), {
    maxAgeMs: EVENTS_MAX_AGE_MS,
  });
  return events;
}

/**
 * Configuração pública do app: textos editáveis, regras públicas, tabela de níveis e versão do conteúdo.
 * @returns {Promise<{settings: Record<string, unknown>, levels: object[], contentVersion: number}>}
 * Usado por: GET /app-config.
 */
export function getAppConfig() {
  return cachedContent("app-config", () => callServer("/app-config"));
}
