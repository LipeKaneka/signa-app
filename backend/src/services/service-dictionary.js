import { callServer } from "../clients/server-client.js";
import { cachedContent } from "../clients/content-cache.js";

/**
 * Lista paginada de verbetes (busca sem acento feita no servidor). Em cache até o conteúdo mudar.
 * @param {{search?: string, category?: string, page: number, limit: number}} query
 * @returns {Promise<{signs: object[], total: number, page: number, pages: number}>}
 * Usado por: GET /dictionary.
 */
export function listSigns({ search, category, page, limit }) {
  const query = { search, category, page, limit };
  return cachedContent(`dictionary:list:${JSON.stringify(query)}`, () => callServer("/dictionary", { query }));
}

/**
 * Categorias do dicionário (em cache até o conteúdo mudar).
 * @returns {Promise<string[]>}
 * Usado por: GET /dictionary/categories.
 */
export async function listCategories() {
  const { categories } = await cachedContent("dictionary:categories", () => callServer("/dictionary/categories"));
  return categories;
}

/**
 * Um verbete pelo slug (em cache até o conteúdo mudar; "não encontrado" não fica em cache).
 * @param {string} slug
 * @returns {Promise<object>}
 * @throws {HttpError} 404 se não existir.
 * Usado por: GET /dictionary/:slug.
 */
export async function getSignBySlug(slug) {
  const { sign } = await cachedContent(`dictionary:sign:${slug}`, () =>
    callServer(`/dictionary/signs/${encodeURIComponent(slug)}`),
  );
  return sign;
}

/**
 * Verbetes cujas palavras aparecem num texto livre.
 * @param {string} text
 * @param {number} [maxResults=5]
 * @returns {Promise<object[]>}
 * Usado por: service-chat.js (cita sinais na resposta do assistente).
 */
export async function findSignsMentionedIn(text, maxResults = 5) {
  const { signs } = await callServer("/dictionary/mentioned", { query: { text, limit: maxResults } });
  return signs;
}
