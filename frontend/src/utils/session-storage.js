const TOKEN_KEY = "signa-ludus:token";

/** localStorage pode falhar (modo privado); nesse caso a sessão dura só enquanto a aba está aberta. */
let memoryToken = null;

/**
 * Token de sessão salvo (localStorage, ou memória se o armazenamento falhar). @returns {string|null}
 */
export function readStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? memoryToken;
  } catch {
    return memoryToken;
  }
}

/**
 * Salva o token de sessão. Usado por: AuthContext.
 */
export function storeToken(token) {
  memoryToken = token;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // segue só com o token em memória
  }
}

/**
 * Apaga o token (logout ou sessão inválida).
 */
export function clearStoredToken() {
  memoryToken = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // nada a limpar
  }
}

/**
 * Lê uma preferência local em JSON (prefixo "signa-ludus:").
 * @param {string} key
 * @param {T} fallback - valor se não existir ou der erro.
 * @returns {T}
 * Usado por: configurações, histórico do assistente, sensibilidade do tradutor.
 */
export function readPreference(key, fallback) {
  try {
    const value = localStorage.getItem(`signa-ludus:${key}`);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * Salva uma preferência local em JSON (ignora falhas de armazenamento).
 */
export function storePreference(key, value) {
  try {
    localStorage.setItem(`signa-ludus:${key}`, JSON.stringify(value));
  } catch {
    // preferência vale só nesta sessão
  }
}
