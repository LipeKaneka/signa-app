import { getEnvironment } from "../config/env.js";
import { callServer } from "./server-client.js";

/** Limite de respostas guardadas (buscas livres no dicionário geram chaves novas; o mais antigo sai primeiro). */
const MAX_ENTRIES = 500;

const entries = new Map();
/** Buscas em andamento por chave (quem pede junto espera a mesma busca). */
const pendingLoads = new Map();
let knownVersion = null;
let versionCheckedAt = 0;
let pendingVersionCheck = null;
/**
 * Sobe a cada limpeza. Uma busca que começou antes de o conteúdo mudar no painel não pode gravar o dado velho
 * depois da limpeza (ficaria preso no cache até a próxima publicação), nem ser reaproveitada por quem pediu depois.
 */
let generation = 0;

/** Esquece tudo o que está guardado e as buscas em andamento (o que elas trouxerem não é gravado). */
function invalidate() {
  entries.clear();
  pendingLoads.clear();
  generation += 1;
}

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
      if (version !== knownVersion) invalidate();
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

  // Vários apps pedindo a mesma coisa ao mesmo tempo (ex.: eventos logo depois de vencer): uma busca só no servidor.
  let pending = pendingLoads.get(key);
  if (!pending) {
    const startedIn = generation;
    pending = load()
      .then((value) => {
        if (startedIn !== generation) return value; // o conteúdo mudou durante a busca: entrega, mas não guarda
        entries.delete(key);
        entries.set(key, { value, storedAt: Date.now() });
        if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value);
        return value;
      })
      .finally(() => {
        if (pendingLoads.get(key) === pending) pendingLoads.delete(key);
      });
    pendingLoads.set(key, pending);
  }
  try {
    return await pending;
  } catch (error) {
    // Servidor fora do ar ou recusando: o conteúdo vencido ainda serve melhor do que um erro na tela.
    if (entry) {
      console.error(`Usando "${key}" vencido do cache: ${error.message}`);
      return entry.value;
    }
    throw error;
  }
}

/** Esvazia o cache e esquece a versão (usado pelos testes). */
export function clearContentCache() {
  invalidate();
  knownVersion = null;
  versionCheckedAt = 0;
}
