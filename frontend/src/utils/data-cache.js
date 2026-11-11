/**
 * Últimos dados que o servidor mandou (trilha, perfil, ranking, dicionário), guardados no aparelho.
 * As telas mostram isto na hora e atualizam em segundo plano: abrir uma tela já visitada não mostra mais "carregando",
 * nem quando o servidor grátis está acordando. Fica na memória e no localStorage (sobrevive a fechar o app).
 * É apagado ao entrar ou sair da conta (os dados são da pessoa logada).
 */
const PREFIX = "signa-ludus:cache:";
/** Limite de entradas guardadas (buscas do dicionário geram chaves novas; as mais antigas saem). */
const MAX_ENTRIES = 40;

const memory = new Map();

function storageKeys() {
  try {
    return Object.keys(localStorage).filter((key) => key.startsWith(PREFIX));
  } catch {
    return [];
  }
}

/**
 * @param {string} key - ex.: "trail", "profile", "ranking:xp".
 * @returns {unknown|undefined} os dados guardados, ou undefined.
 */
export function readCache(key) {
  if (memory.has(key)) return memory.get(key).value;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    const entry = JSON.parse(raw);
    memory.set(key, entry);
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
  memory.set(key, entry);
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(entry));
    const keys = storageKeys();
    if (keys.length > MAX_ENTRIES) {
      const oldest = keys
        .map((stored) => ({ stored, savedAt: JSON.parse(localStorage.getItem(stored) ?? "{}").savedAt ?? 0 }))
        .sort((a, b) => a.savedAt - b.savedAt)
        .slice(0, keys.length - MAX_ENTRIES);
      oldest.forEach(({ stored }) => localStorage.removeItem(stored));
    }
  } catch {
    // Sem espaço ou sem localStorage (modo privado): fica só na memória.
  }
}

/** Apaga tudo (ao entrar/sair da conta). Usado por: AuthContext. */
export function clearCache() {
  memory.clear();
  storageKeys().forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignora
    }
  });
}
