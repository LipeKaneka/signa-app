import { MESSAGES } from "../../config/messages.js";

/** Regras do backend repetidas aqui só para avisar antes de enviar (o backend confere de novo). */
export const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** @returns {boolean} se o texto tem formato de e-mail. */
export function isValidEmail(email) {
  return EMAIL_PATTERN.test(email.trim());
}

/**
 * Confere a senha nova e a confirmação.
 * @returns {string} mensagem de erro, ou "" se estiver tudo certo.
 * Usado por: RegisterPage e NewPasswordPage.
 */
export function validateNewPassword(password, confirmation) {
  if (password.length < MIN_PASSWORD_LENGTH) return MESSAGES.auth.passwordTooShort(MIN_PASSWORD_LENGTH);
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return MESSAGES.auth.passwordNeedsLettersAndNumbers;
  if (password !== confirmation) return MESSAGES.auth.passwordsDiffer;
  return "";
}
