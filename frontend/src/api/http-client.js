import { readStoredToken } from "../utils/session-storage.js";

const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8080/api/v1").replace(/\/$/, "");

/** Código que o backend manda quando a conta foi banida (vem com {ban: {reason, until}}). */
export const ACCOUNT_BANNED = "account_banned";

/**
 * Erro de API com a mensagem do backend ({error}) e o status HTTP (0 = sem conexão).
 * @property {number} status
 * @property {string} [code] - ex.: ACCOUNT_BANNED.
 * @property {{reason: string, until: string|null}} [ban] - motivo e prazo, quando code = ACCOUNT_BANNED.
 * As telas mostram error.message direto ao usuário (o backend já devolve textos amigáveis).
 */
export class ApiError extends Error {
  constructor(status, message, { code, ban } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    if (code) this.code = code;
    if (ban) this.ban = ban;
  }
}

const unauthorizedListeners = new Set();
const bannedListeners = new Set();

/**
 * Inscreve uma função chamada quando qualquer requisição responde "conta banida".
 * @param {(ban: {reason: string, until: string|null}) => void} listener
 * @returns {() => void} função para cancelar a inscrição.
 * Usado por: AuthContext (tira a pessoa da conta).
 */
export function onAccountBanned(listener) {
  bannedListeners.add(listener);
  return () => bannedListeners.delete(listener);
}

/**
 * Inscreve uma função chamada quando qualquer requisição recebe 401 (sessão expirada/inválida).
 * @param {() => void} listener
 * @returns {() => void} função para cancelar a inscrição.
 * Usado por: AuthContext (sai da conta).
 */
export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

/**
 * Cabeçalhos da requisição: JSON quando há corpo e o token "Bearer" quando há sessão.
 * @param {boolean} hasBody
 * @returns {Record<string, string>}
 */
function buildHeaders(hasBody) {
  const headers = {};
  if (hasBody) headers["Content-Type"] = "application/json";
  const token = readStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * Lê o JSON da resposta; devolve {} se o corpo vier vazio ou inválido.
 * @returns {Promise<object>}
 */
async function readJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

/**
 * ÚNICO ponto de saída do app para a rede: chama a API em VITE_API_URL (backend em outro servidor).
 * @param {string} path - caminho a partir de /api/v1 (ex.: "/trail").
 * @param {{method?: string, body?: object, query?: Record<string, unknown>}} [options]
 * @returns {Promise<object>} JSON de sucesso.
 * @throws {ApiError} com a mensagem do backend; status 0 quando não há conexão.
 * Usado por: todos os módulos api-*.js. Ao trocar a arquitetura (servidor de gerenciamento), as telas
 * continuam iguais: só o backend muda de onde busca os dados.
 */
export async function requestApi(path, { method = "GET", body, query } = {}) {
  const url = new URL(`${API_URL}${path}`, window.location.href);
  Object.entries(query ?? {})
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .forEach(([key, value]) => url.searchParams.set(key, value));

  let response;
  try {
    response = await fetch(url, {
      method,
      // Sem cache do WebView: o painel pode mudar eventos e textos a qualquer momento (o backend já tem cache próprio).
      cache: "no-store",
      headers: buildHeaders(body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Sem conexão com o servidor. Verifique sua internet.");
  }

  const data = await readJsonSafely(response);
  if (!response.ok) {
    if (response.status === 401) unauthorizedListeners.forEach((listener) => listener());
    const banned = response.status === 403 && data.code === ACCOUNT_BANNED;
    if (banned) bannedListeners.forEach((listener) => listener(data.ban ?? null));
    throw new ApiError(response.status, data.error ?? "Algo deu errado. Tente novamente.", banned ? { code: ACCOUNT_BANNED, ban: data.ban ?? { reason: "", until: null } } : {});
  }
  return data;
}
