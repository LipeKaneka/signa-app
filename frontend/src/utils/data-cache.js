/**
 * Últimos dados que o servidor mandou (trilha, perfil, ranking, dicionário), guardados no aparelho.
 * As telas mostram isto na hora e atualizam em segundo plano: abrir uma tela já visitada não mostra mais "carregando",
 * nem quando o servidor grátis está acordando. Fica na memória e no localStorage (sobrevive a fechar o app).
 * É apagado ao entrar ou sair da conta (os dados são da pessoa logada).
 */
const PREFIX = "signa-ludus:cache:";
/** Limite de entradas guardadas no aparelho e na memória (as mais antigas saem). */
const MAX_ENTRIES = 40;
/**
 * Chaves que ficam só na memória: cada busca do dicionário gera uma chave nova com até 100 sinais, o que enchia o
 * localStorage (limite ~5 MB) sem ajudar a abrir o app mais rápido.
 */
const MEMORY_ONLY_PREFIXES = ["dictionary:search:"];

const memory = new Map();
/**
 * Quando cada chave do localStorage foi salva (chave sem o prefixo → savedAt). Montado uma vez, na primeira gravação:
 * antes, toda gravação acima do limite lia e interpretava todas as entradas guardadas para achar as mais antigas.
 */
let storedIndex = null;

const isMemoryOnly = (key) => MEMORY_ONLY_PREFIXES.some((prefix) => key.startsWith(prefix));

function storageKeys() {
  try {
    return Object.keys(localStorage).filter((key) => key.startsWith(PREFIX));
  } catch {
    return [];
  }
}

function readStoredIndex() {
  if (storedIndex) return storedIndex;
  storedIndex = new Map();
  for (const stored of storageKeys()) {
    const key = stored.slice(PREFIX.length);
    try {
      // Buscas guardadas por versões anteriores do app: saem do aparelho.
      if (isMemoryOnly(key)) localStorage.removeItem(stored);
      else storedIndex.set(key, JSON.parse(localStorage.getItem(stored) ?? "{}").savedAt ?? 0);
    } catch {
      storedIndex.set(key, 0);
    }
  }
  return storedIndex;
}

/** Tira do mapa as entradas mais antigas até caber no limite (o Map guarda a ordem de inserção). */
function trimMemory() {
  while (memory.size > MAX_ENTRIES) memory.delete(memory.keys().next().value);
}

/**
 * @param {string} key - ex.: "trail", "profile", "ranking:xp".
 * @returns {unknown|undefined} os dados guardados, ou undefined.
 */
export function readCache(key) {
  if (memory.has(key)) return memory.get(key).value;
  if (isMemoryOnly(key)) return undefined;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    const entry = JSON.parse(raw);
    memory.set(key, entry);
    trimMemory();
    return entry.value;
  } catch {
    return undefined;
  }
}

/**
 * Guarda os dados mais recentes de uma chave.
 * @param {string} key
 * @param {unknown} value
 */
export function writeCache(key, value) {
  const entry = { value, savedAt: Date.now() };
  memory.delete(key); // volta para o fim da fila (é a mais recente)
  memory.set(key, entry);
  trimMemory();
  if (isMemoryOnly(key)) return;
  try {
    const index = readStoredIndex();
    localStorage.setItem(PREFIX + key, JSON.stringify(entry));
    index.set(key, entry.savedAt);
    if (index.size <= MAX_ENTRIES) return;
    const oldest = [...index].sort((a, b) => a[1] - b[1]).slice(0, index.size - MAX_ENTRIES);
    for (const [stored] of oldest) {
      localStorage.removeItem(PREFIX + stored);
      index.delete(stored);
    }
  } catch {
    // Sem espaço ou sem localStorage (modo privado): fica só na memória.
  }
}

/** Apaga tudo (ao entrar/sair da conta). Usado por: AuthContext. */
export function clearCache() {
  memory.clear();
  storedIndex = new Map();
  storageKeys().forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignora
    }
  });
}
