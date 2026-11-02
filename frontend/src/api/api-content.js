import { requestApi } from "./http-client.js";

/**
 * GET /ranking?metric=. @param {"activities"|"xp"|"streak"} metric Usado por: RankingPage.
 */
export function fetchRanking(metric) {
  // A tela mostra a lista inteira (sem "..."): pede até 50 pessoas.
  return requestApi("/ranking", { query: { metric, limit: 50 } });
}

/**
 * GET /dictionary. @returns {Promise<{signs, total, page, pages}>} Usado por: DictionaryPage.
 */
export function searchDictionary({ search, category, page }) {
  return requestApi("/dictionary", { query: { search, category, page, limit: 100 } });
}

/**
 * GET /dictionary/categories. @returns {Promise<{categories: string[]}>} Usado por: DictionaryPage.
 */
export function fetchDictionaryCategories() {
  return requestApi("/dictionary/categories");
}

/**
 * POST /chat. @param {string} question @param {{role, content}[]} history
 * @returns {Promise<{answer, signs, source}>} Usado por: AssistantPage.
 */
export function askAssistant(question, history) {
  return requestApi("/chat", { method: "POST", body: { question, history } });
}

/**
 * GET /app-config (sem login). @returns {Promise<{settings: Record<string, unknown>, levels: object[], contentVersion: number}>}
 * Textos e regras públicas editados no painel. Usado por: AppConfigContext.
 */
export function fetchAppConfig() {
  return requestApi("/app-config");
}

/**
 * GET /events/active (sem login). @returns {Promise<{events: object[]}>} eventos valendo agora (ex.: 2x XP).
 * Usado por: AppConfigContext (faixa de evento).
 */
export function fetchActiveEvents() {
  return requestApi("/events/active");
}
