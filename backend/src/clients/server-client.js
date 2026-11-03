import { getEnvironment } from "../config/env.js";
import { HttpError } from "../utils/util-http-error.js";

/**
 * Tempo máximo esperando o servidor de gerenciamento antes de responder "indisponível" ao app.
 * Longo de propósito: em hospedagens grátis (Render) o servidor "dorme" sem uso e leva até ~50 s para acordar.
 */
const REQUEST_TIMEOUT_MS = 55000;
/** Respostas do proxy da hospedagem enquanto o servidor acorda ou reinicia: vale tentar de novo. */
const WAKING_STATUSES = new Set([502, 503, 504]);
const WAKING_RETRIES = 3;
const WAKING_RETRY_DELAY_MS = 3000;
const UNAVAILABLE_MESSAGE = "Serviço temporariamente indisponível. Tente de novo em instantes.";
/** Mensagem do servidor quando a chave de serviço não confere (server/src/middlewares/service-auth-middleware.js). */
const SERVICE_KEY_REJECTED_MESSAGE = "Chave de serviço inválida.";

/**
 * Monta a URL da API interna com os parâmetros de consulta (ignora vazios).
 * @param {string} path - caminho a partir de /internal/v1 (ex.: "/dictionary").
 * @param {Record<string, unknown>} [query]
 * @returns {URL}
 */
function buildUrl(path, query) {
  const url = new URL(`${getEnvironment().serverUrl}${path}`);
  Object.entries(query ?? {})
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return url;
}

/**
 * Lê o JSON da resposta; devolve {} se vier vazio ou inválido.
 * @param {Response} response
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
 * Converte um erro 4xx do servidor (validação, permissão, sessão) num HttpError com o mesmo status e
 * mensagem. Erros 5xx não passam por aqui: viram 503 genérico (o app nunca vê detalhes internos).
 * @param {number} status
 * @param {{error?: string}} data
 * @returns {HttpError}
 */
function toHttpError(status, data) {
  return new HttpError(status, data.error ?? "Não foi possível concluir a operação.");
}

/**
 * Chama a API interna do servidor de gerenciamento com a chave de serviço.
 * ÚNICO ponto de contato do backend com o servidor: trocar o servidor de máquina = mudar SERVER_URL.
 * @param {string} path - caminho a partir de /internal/v1.
 * @param {{method?: string, body?: object, query?: Record<string, unknown>}} [options]
 * @returns {Promise<object>} JSON de sucesso.
 * @throws {HttpError} com o status/mensagem do servidor (4xx) ou 503 se ele estiver fora do ar.
 * Usado por: todos os services do backend.
 */
export async function callServer(path, { method = "GET", body, query } = {}) {
  const { serverServiceKey } = getEnvironment();
  const headers = { "X-Service-Key": serverServiceKey };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  // Um só prazo para a chamada inteira (com as novas tentativas dentro dele).
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let response;
  for (let attempt = 0; ; attempt += 1) {
    try {
      response = await fetch(buildUrl(path, query), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
    } catch (error) {
      console.error(`Servidor de gerenciamento inacessível (${method} ${path}):`, error.message);
      throw new HttpError(503, UNAVAILABLE_MESSAGE);
    }
    // Servidor acordando: só repete leituras (GET), que não mudam nada se chegarem duas vezes.
    if (method !== "GET" || !WAKING_STATUSES.has(response.status) || attempt >= WAKING_RETRIES || signal.aborted) break;
    await new Promise((resolve) => setTimeout(resolve, WAKING_RETRY_DELAY_MS));
  }

  const data = await readJsonSafely(response);
  if (response.ok) return data;

  // Chave recusada é erro de configuração do backend, não do usuário: não pode virar 401 (o app sairia da conta).
  const serviceKeyRejected = response.status === 401 && data.error === SERVICE_KEY_REJECTED_MESSAGE;
  if (response.status >= 500 || serviceKeyRejected) {
    console.error(`Servidor de gerenciamento respondeu ${response.status} (${method} ${path}):`, data.error);
    throw new HttpError(503, UNAVAILABLE_MESSAGE);
  }
  throw toHttpError(response.status, data);
}

/**
 * Caminho das rotas de um usuário na API interna.
 * @param {string} userId - id interno (vem do token do app).
 * @param {string} [suffix] - ex.: "/trail".
 * @returns {string}
 */
export function userPath(userId, suffix = "") {
  return `/users/${encodeURIComponent(userId)}${suffix}`;
}
