import { callServer, userPath } from "../clients/server-client.js";
import { generateAccessToken } from "../utils/util-tokens.js";

/**
 * Cria a conta no servidor e devolve a sessão do app (o token é emitido aqui, no backend).
 * @param {{nickname: string, email: string, password: string, acceptedTerms: boolean}} data - já validado pelo controller.
 * @returns {Promise<{token: string, user: object}>}
 * @throws {HttpError} 409 se o e-mail já existir (vindo do servidor).
 * Usado por: POST /auth/register.
 */
export async function createAccount({ nickname, email, password, acceptedTerms }) {
  const { id, user } = await callServer("/auth/register", { method: "POST", body: { nickname, email, password, acceptedTerms } });
  return { token: generateAccessToken(id), user };
}

/**
 * Login: o servidor confere a senha; o backend emite o token do app.
 * @param {{email: string, password: string}} credentials
 * @returns {Promise<{token: string, user: object}>}
 * @throws {HttpError} 401 credenciais erradas; 403 conta bloqueada.
 * Usado por: POST /auth/login.
 */
export async function signIn({ email, password }) {
  const { id, user } = await callServer("/auth/verify-credentials", { method: "POST", body: { email, password } });
  return { token: generateAccessToken(id), user };
}

/**
 * Perfil + conquistas com progresso.
 * @param {string} userId - id interno (do token).
 * @returns {Promise<{user: object, achievements: object[]}>}
 * Usado por: GET /profile.
 */
export function getProfileWithAchievements(userId) {
  return callServer(userPath(userId, "/profile"));
}

/**
 * Atualiza o perfil (e-mail e senha exigem a senha atual; o servidor confere).
 * @param {string} userId
 * @param {{nickname?, email?, password?, city?, showInRanking?}} changes - já validado.
 * @param {string} [currentPassword]
 * @returns {Promise<object>} perfil público atualizado.
 * Usado por: PATCH /profile.
 */
export async function updateProfile(userId, changes, currentPassword) {
  const definedChanges = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
  const { user } = await callServer(userPath(userId), { method: "PATCH", body: { changes: definedChanges, currentPassword } });
  return user;
}

/**
 * Exclui a conta (exige a senha atual) e esquece a sessão em cache.
 * @param {string} userId
 * @param {string} [currentPassword]
 * @returns {Promise<void>}
 * Usado por: DELETE /profile.
 */
export async function deleteAccount(userId, currentPassword) {
  await callServer(userPath(userId), { method: "DELETE", body: { currentPassword } });
}

/**
 * Confere no servidor se a conta do token ainda existe e está ativa.
 * @param {string} userId
 * @returns {Promise<void>}
 * @throws {HttpError} 401 (conta não existe) ou 403 (bloqueada).
 * Usado por: auth-middleware.js (com cache curto).
 */
export async function checkSession(userId) {
  await callServer(userPath(userId, "/session"));
}

/**
 * Pede o código de recuperação de senha (o servidor envia; a resposta não revela se a conta existe).
 * @param {string} email
 * @returns {Promise<void>}
 * Usado por: POST /auth/password-reset/request.
 */
export async function requestPasswordReset(email) {
  await callServer("/auth/password-reset/request", { method: "POST", body: { email } });
}

/**
 * Confere o código de recuperação sem gastá-lo.
 * @returns {Promise<void>}
 * @throws {HttpError} 400 se inválido ou vencido.
 * Usado por: POST /auth/password-reset/verify.
 */
export async function verifyPasswordReset(email, code) {
  await callServer("/auth/password-reset/verify", { method: "POST", body: { email, code } });
}

/**
 * Troca a senha com o código e já abre a sessão (como no login).
 * @returns {Promise<{token: string, user: object}>}
 * Usado por: POST /auth/password-reset/confirm.
 */
export async function confirmPasswordReset(email, code, password) {
  await callServer("/auth/password-reset/confirm", { method: "POST", body: { email, code, password } });
  return signIn({ email, password });
}
