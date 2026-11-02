import { getEnvironment } from "../config/env.js";
import { callServer } from "./server-client.js";

/** Limite de respostas guardadas (buscas livres no dicionário geram chaves novas; o mais antigo sai primeiro). */
const MAX_ENTRIES = 500;

const entries = new Map();
let knownVersion = null;
let versionCheckedAt = 0;
let pendingVersionCheck = null;

/**
 * Confere a versão do conteúdo no servidor (no máximo uma vez a cada CONTENT_VERSION_TTL_MS).
 * Versão diferente da conhecida = algo mudou no painel/seed: descarta todo o cache.
 * Se o servidor não responder e já houver cache, segue com o cache (o app continua funcionando).
 * @returns {Promise<void>}
 * @throws {HttpError} 503 se o servidor estiver fora do ar e ainda não houver nada em cache.
 */
async function refreshVersion() {
  const { contentVersionTtlMs } = getEnvironment();
  if (knownVersion !== null && Date.now() - versionCheckedAt < contentVersionTtlMs) return;

  pendingVersionCheck ??= callServer("/content/version")
    .then(({ version }) => {
      if (version !== knownVersion) entries.clear();
      knownVersion = version;
      versionCheckedAt = Date.now();
    })
    .catch((error) => {
      if (knownVersion === null) throw error;
      console.error("Não foi possível conferir a versão do conteúdo; usando o cache atual.");
    })
    .finally(() => {
      pendingVersionCheck = null;
    });
  await pendingVersionCheck;
}

/**
 * Conteúdo público (igual para todos os usuários) guardado em memória até a versão do conteúdo mudar.
 * NUNCA use para dados de um usuário (perfil, trilha, tentativas): esses vão sempre ao servidor.
 * @template T
 * @param {string} key - identifica a resposta (ex.: "dictionary:categories").
 * @param {() => Promise<T>} load - busca no servidor quando não há cache válido.
 * @param {{maxAgeMs?: number}} [options] - maxAgeMs: validade extra por tempo, para o que muda sozinho
 *   com o relógio (ex.: eventos que começam/terminam sem ninguém mexer no painel).
 * @returns {Promise<T>}
 * Usado por: service-dictionary.js e service-content.js.
 */
export async function cachedContent(key, load, { maxAgeMs } = {}) {
  await refreshVersion();
  const entry = entries.get(key);
  const expired = entry && maxAgeMs !== undefined && Date.now() - entry.storedAt >= maxAgeMs;
  if (entry && !expired) return entry.value;

  const value = await load();
  entries.delete(key);
  entries.set(key, { value, storedAt: Date.now() });
  if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value);
  return value;
}

/** Esvazia o cache e esquece a versão (usado pelos testes). */
export function clearContentCache() {
  entries.clear();
  knownVersion = null;
  versionCheckedAt = 0;
}
