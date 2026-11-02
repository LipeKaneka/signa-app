/**
 * Minúsculas e sem acentos ("Maçã" -> "maca"). Base das buscas que ignoram acento.
 * @param {unknown} text
 * @returns {string}
 * Usado por: slugify, service-dictionary.js.
 */
export function normalizeText(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Texto em formato de slug ("Bom dia" -> "bom-dia"). Usado como identificador legível.
 * @param {unknown} text
 * @returns {string}
 * Usado por: util-generators.js, seeds (slug dos sinais).
 */
export function slugify(text) {
  return normalizeText(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Escapa caracteres especiais para usar texto do usuário dentro de uma RegExp com segurança.
 * @param {string} text
 * @returns {string}
 * Usado por: service-dictionary.js (busca).
 */
export function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
