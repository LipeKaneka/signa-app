import { PASSWORD_RULES } from "../config/rules.js";
import { badRequest } from "./util-http-error.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lê um texto obrigatório vindo da requisição, já sem espaços nas pontas.
 * @param {unknown} value
 * @param {string} fieldLabel - nome do campo na mensagem de erro ("o apelido").
 * @param {number} [maxLength=200]
 * @returns {string}
 * @throws {HttpError} 400 se vazio, não for texto ou passar do tamanho.
 * Usado por: controllers de usuário, trilha e chat.
 */
export function readRequiredString(value, fieldLabel, maxLength = 200) {
  if (typeof value !== "string" || value.trim() === "") {
    throw badRequest(`Informe ${fieldLabel}.`);
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw badRequest(`${fieldLabel} pode ter no máximo ${maxLength} caracteres.`);
  }
  return text;
}

/**
 * Como readRequiredString, mas aceita ausência.
 * @returns {string|undefined}
 */
export function readOptionalString(value, fieldLabel, maxLength = 200) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw badRequest(`${fieldLabel} inválido.`);
  const text = value.trim();
  if (text.length > maxLength) {
    throw badRequest(`${fieldLabel} pode ter no máximo ${maxLength} caracteres.`);
  }
  return text;
}

/**
 * Lê e valida um e-mail (minúsculas).
 * @returns {string}
 * @throws {HttpError} 400 se inválido.
 */
export function readEmail(value) {
  const email = readRequiredString(value, "o e-mail", 254).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw badRequest("E-mail inválido.");
  return email;
}

/**
 * Valida uma senha nova: tamanho mínimo (PASSWORD_RULES), máximo 128, letras e números.
 * @returns {string}
 * @throws {HttpError} 400 se não atender às regras.
 */
export function readNewPassword(value) {
  if (typeof value !== "string" || value.length < PASSWORD_RULES.MIN_LENGTH) {
    throw badRequest(`A senha precisa ter pelo menos ${PASSWORD_RULES.MIN_LENGTH} caracteres.`);
  }
  if (value.length > 128) throw badRequest("A senha pode ter no máximo 128 caracteres.");
  if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
    throw badRequest("A senha precisa ter letras e números.");
  }
  return value;
}

/**
 * Lê um booleano opcional.
 * @returns {boolean|undefined}
 * @throws {HttpError} 400 se vier algo que não seja true/false.
 */
export function readBoolean(value, fieldLabel) {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw badRequest(`${fieldLabel} deve ser verdadeiro ou falso.`);
  return value;
}

/**
 * Lê um inteiro positivo de query string, com valor padrão e teto.
 * @param {unknown} value
 * @param {{fallback: number, max: number}} limits
 * @returns {number}
 * Usado por: paginação do dicionário e limite do ranking.
 */
export function readPositiveInteger(value, { fallback, max }) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.min(number, max);
}

/** Foto de perfil: data URL de imagem JPEG, PNG ou WebP (nunca SVG, que pode levar script), até ~45 KB. */
const AVATAR_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
export const AVATAR_MAX_LENGTH = 60000;
/** Miniatura 64×64 usada no ranking (lista de até 50 pessoas: precisa ser leve). */
export const AVATAR_THUMB_MAX_LENGTH = 8000;

/**
 * Lê a foto de perfil: undefined = não mexe; "" = remove a foto; senão, data URL de imagem pequena.
 * O app já reduz a foto para 256×256 (e a miniatura para 64×64) antes de enviar.
 * @param {unknown} value
 * @param {number} [maxLength] - AVATAR_MAX_LENGTH (foto) ou AVATAR_THUMB_MAX_LENGTH (miniatura).
 * @returns {string|undefined}
 * @throws {HttpError} 400 se não for uma imagem aceita ou for grande demais.
 */
export function readAvatar(value, maxLength = AVATAR_MAX_LENGTH) {
  if (value === undefined || value === "") return value;
  if (typeof value !== "string" || !AVATAR_PATTERN.test(value)) throw badRequest("A foto precisa ser uma imagem JPEG, PNG ou WebP.");
  if (value.length > maxLength) throw badRequest("A foto é grande demais. Escolha outra imagem.");
  return value;
}
