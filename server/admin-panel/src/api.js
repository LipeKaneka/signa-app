/**
 * Único ponto de rede do painel: chama a API administrativa do servidor (/admin/api/v1), na mesma origem.
 * - O cookie de sessão (httpOnly) vai sozinho; o JavaScript nunca vê o token.
 * - X-Signa-Admin: 1 em toda chamada (o servidor recusa sem ele: proteção contra CSRF).
 * - Erro vira ApiError com a mensagem do servidor; 401 avisa o app para voltar ao login.
 */
const BASE = "/admin/api/v1";

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized = () => {};

/**
 * Define o que fazer quando a sessão expirar (o AuthProvider limpa o usuário e mostra o login).
 * @param {() => void} handler
 */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

/**
 * Chama a API do painel.
 * @param {string} path - ex.: "/modules".
 * @param {{method?: string, body?: unknown, query?: Record<string, unknown>}} [options]
 * @returns {Promise<any>} JSON da resposta.
 * @throws {ApiError}
 */
export async function api(path, { method = "GET", body, query } = {}) {
  const url = new URL(BASE + path, window.location.origin);
  Object.entries(query ?? {})
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .forEach(([key, value]) => url.searchParams.set(key, String(value)));

  let response;
  try {
    response = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: { "X-Signa-Admin": "1", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Não foi possível falar com o servidor. Confira se ele está rodando.");
  }

  const data = await response.json().catch(() => ({}));
  if (response.ok) return data;
  if (response.status === 401 && path !== "/auth/login") onUnauthorized();
  throw new ApiError(response.status, data.error ?? "Algo deu errado.");
}

/**
 * Baixa o conteúdo exportado como arquivo .json.
 * @returns {Promise<void>}
 */
export async function downloadExport() {
  const data = await api("/database/export");
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `signa-ludus-conteudo-${data.exportedAt.slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}
