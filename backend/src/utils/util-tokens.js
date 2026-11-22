import jwt from "jsonwebtoken";
import { getEnvironment } from "../config/env.js";

/**
 * Gera o JWT de acesso. O payload leva o id interno (sub) e a versão da sessão (sv); expira em JWT_EXPIRES_IN.
 * A versão sobe no servidor a cada troca de senha: tokens com versão antiga deixam de valer (outros aparelhos saem).
 * @param {string} userId - id interno do usuário (vem do servidor de gerenciamento).
 * @param {number} [sessionVersion] - user.sessionVersion do servidor.
 * @returns {string}
 * Usado por: service-user.js (cadastro, login, Google, troca e redefinição de senha).
 */
export function generateAccessToken(userId, sessionVersion = 0) {
  const { jwtSecret, jwtExpiresIn } = getEnvironment();
  return jwt.sign({ sv: Number(sessionVersion) || 0 }, jwtSecret, { subject: String(userId), expiresIn: jwtExpiresIn });
}

/**
 * Valida o JWT e devolve o id do usuário e a versão da sessão.
 * Tokens antigos (sem "sv") valem como versão 0: deixam de valer na primeira troca de senha.
 * @param {string} token
 * @returns {{userId: string, sessionVersion: number}|null} null se inválido ou expirado.
 * Usado por: auth-middleware.js.
 */
export function readTokenClaims(token) {
  try {
    const payload = jwt.verify(token, getEnvironment().jwtSecret);
    if (!payload.sub) return null;
    return { userId: payload.sub, sessionVersion: Number(payload.sv) || 0 };
  } catch {
    return null;
  }
}

/**
 * Só o id do usuário do token (null se inválido). Mantido para quem só precisa do id (testes).
 * @param {string} token
 * @returns {string|null}
 */
export function readUserIdFromToken(token) {
  return readTokenClaims(token)?.userId ?? null;
}
