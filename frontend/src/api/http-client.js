import { readStoredToken } from "../utils/session-storage.js";
import { MESSAGES } from "../config/messages.js";

const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8080/api/v1").replace(/\/$/, "");

/** Código que o backend manda quando a conta foi banida (vem com {ban: {reason, until}}). */
export const ACCOUNT_BANNED = "account_banned";
/** Código que o backend manda durante a manutenção, para contas não liberadas (vem com {maintenance: pop-up}). */
export const MAINTENANCE = "maintenance";

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
const maintenanceListeners = new Set();

/**
 * Inscreve uma função chamada quando uma requisição responde "em manutenção" (conta não liberada).
 * @param {(popup: object|null) => void} listener - recebe os textos do pop-up de manutenção.
 * @returns {() => void} cancela a inscrição.
 * Usado por: useMaintenancePopup (mostra o pop-up e fecha o app).
 */
export function onMaintenance(listener) {
  maintenanceListeners.add(listener);
  return () => maintenanceListeners.delete(listener);
}

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
 * Abre um fluxo de Server-Sent Events da API com o token (o EventSource do navegador não manda cabeçalho).
 * @param {string} path - ex.: "/notifications/stream".
 * @param {(event: string, data: unknown) => void} onEvent - cada mensagem recebida.
 * @param {AbortSignal} signal - abortar fecha o fluxo.
 * @returns {Promise<void>} termina quando o fluxo fecha.
 * @throws {ApiError} conexão recusada (401 sai da conta, como nas outras chamadas).
 * Usado por: NotificationsProvider.
 */
export async function openApiStream(path, onEvent, signal) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { headers: { ...buildHeaders(false), Accept: "text/event-stream" }, cache: "no-store", signal });
  } catch (error) {
    if (signal.aborted) return;
    throw new ApiError(0, error.message);
  }
  if (!response.ok || !response.body) {
    if (response.status === 401) unauthorizedListeners.forEach((listener) => listener());
    throw new ApiError(response.status, MESSAGES.network.streamUnavailable);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (; ;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let end;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let event = "message";
      const data = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trim());
      }
      if (data.length === 0) continue;
      try {
        onEvent(event, JSON.parse(data.join("\n")));
      } catch {
        // mensagem inválida: ignora
      }
    }
  }
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

/** Intervalo mínimo entre dois "despertadores" (abrir e voltar ao app em sequência não repete o pedido). */
const WAKE_UP_MIN_INTERVAL_MS = 60 * 1000;
let lastWakeUpAt = 0;

/**
 * Pede GET /health ao backend sem esperar a resposta. Na hospedagem grátis (Render) o backend dorme sem uso e leva
 * até ~50 s para acordar; chamando isto assim que o app abre, ele já vai acordando enquanto a pessoa vê a tela de
 * entrada ou digita a senha. Ao subir, o backend acorda também o servidor de gerenciamento (backend/index.js).
 * Erros são ignorados: é só um aviso, as chamadas normais continuam com o próprio tratamento.
 * Usado por: main.jsx (ao abrir e ao voltar do segundo plano).
 */
export function wakeUpApi() {
  const now = Date.now();
  if (now - lastWakeUpAt < WAKE_UP_MIN_INTERVAL_MS) return;
  lastWakeUpAt = now;
  fetch(new URL(`${API_URL}/health`, window.location.href), { cache: "no-store" }).catch(() => { });
}

/**
 * Tempo máximo esperando uma resposta. Longo de propósito: no Render grátis o backend e o servidor podem estar
 * acordando (~50 s cada). Sem limite, uma rede móvel travada deixava a tela "Conectando…" parada para sempre.
 */
const REQUEST_TIMEOUT_MS = 90 * 1000;
const TIMEOUT_MESSAGE = MESSAGES.network.timeout;
const OFFLINE_MESSAGE = MESSAGES.network.offline;

/**
 * Requisições em andamento, pela chave método + endereço + corpo + sessão. Se a mesma requisição for pedida de novo
 * antes de a primeira terminar (duas telas pedindo /profile, toque duplo em "Enviar"), a nova não sai: ela recebe a
 * resposta da antiga. A entrada sai do mapa assim que a antiga termina (com sucesso ou erro).
 */
const inFlightRequests = new Map();

/**
 * ÚNICO ponto de saída do app para a rede: chama a API em VITE_API_URL (backend em outro servidor).
 * Requisições iguais ao mesmo tempo viram uma só (vale a mais antiga; ver inFlightRequests).
 * @param {string} path - caminho a partir de /api/v1 (ex.: "/trail").
 * @param {{method?: string, body?: object, query?: Record<string, unknown>}} [options]
 * @returns {Promise<object>} JSON de sucesso.
 * @throws {ApiError} com a mensagem do backend; status 0 quando não há conexão ou passou do tempo.
 * Usado por: todos os módulos api-*.js. Ao trocar a arquitetura (servidor de gerenciamento), as telas
 * continuam iguais: só o backend muda de onde busca os dados.
 */
export function requestApi(path, { method = "GET", body, query } = {}) {
  const url = new URL(`${API_URL}${path}`, window.location.href);
  Object.entries(query ?? {})
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .forEach(([key, value]) => url.searchParams.set(key, value));
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const key = `${method} ${url.href} ${payload ?? ""} ${readStoredToken() ?? ""}`;

  const pending = inFlightRequests.get(key);
  if (pending) return pending;
  const request = sendRequest(url, method, payload).finally(() => inFlightRequests.delete(key));
  inFlightRequests.set(key, request);
  return request;
}

async function sendRequest(url, method, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  let data;
  try {
    response = await fetch(url, {
      method,
      // Sem cache do WebView: o painel pode mudar eventos e textos a qualquer momento (o backend já tem cache próprio).
      cache: "no-store",
      headers: buildHeaders(payload !== undefined),
      body: payload,
      signal: controller.signal,
    });
    // Só no npm run dev: no APK e no site publicado, logar cada pedido só enchia o console.
    if (import.meta.env.DEV) console.log(`log da url:`, url)
    data = await readJsonSafely(response);
    if (controller.signal.aborted) throw new Error("tempo esgotado lendo a resposta");
  } catch {
    throw new ApiError(0, controller.signal.aborted ? TIMEOUT_MESSAGE : OFFLINE_MESSAGE);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    if (response.status === 401) unauthorizedListeners.forEach((listener) => listener());
    const banned = response.status === 403 && data.code === ACCOUNT_BANNED;
    if (banned) bannedListeners.forEach((listener) => listener(data.ban ?? null));
    if (response.status === 503 && data.code === MAINTENANCE) maintenanceListeners.forEach((listener) => listener(data.maintenance ?? null));
    throw new ApiError(response.status, data.error ?? MESSAGES.network.generic, banned ? { code: ACCOUNT_BANNED, ban: data.ban ?? { reason: "", until: null } } : {});
  }
  return data;
}
