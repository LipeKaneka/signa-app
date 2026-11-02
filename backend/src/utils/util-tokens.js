import jwt from "jsonwebtoken";
import { getEnvironment } from "../config/env.js";

/**
 * Gera o JWT de acesso. O payload leva só o id interno (sub); expira em JWT_EXPIRES_IN.
 * @param {string} userId - id interno do usuário (vem do servidor de gerenciamento).
 * @returns {string}
 * Usado por: service-user.js (cadastro e login).
 */
export function generateAccessToken(userId) {
  const { jwtSecret, jwtExpiresIn } = getEnvironment();
  return jwt.sign({}, jwtSecret, { subject: String(userId), expiresIn: jwtExpiresIn });
}

/**
 * Valida o JWT e devolve o id do usuário.
 * @param {string} token
 * @returns {string|null} null se inválido ou expirado.
 * Usado por: auth-middleware.js.
 */
export function readUserIdFromToken(token) {
  try {
    const payload = jwt.verify(token, getEnvironment().jwtSecret);
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
