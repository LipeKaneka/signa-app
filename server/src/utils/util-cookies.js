/**
 * Lê os cookies do cabeçalho "Cookie" (sem dependência extra).
 * @param {string|undefined} header
 * @returns {Record<string, string>} nome -> valor (decodificado).
 * Usado por: admin-auth-middleware.js.
 */
export function parseCookies(header) {
  const cookies = {};
  for (const part of String(header ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const name = part.slice(0, separator).trim();
    if (!name || name in cookies) continue;
    try {
      cookies[name] = decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      // valor malformado: ignora
    }
  }
  return cookies;
}
