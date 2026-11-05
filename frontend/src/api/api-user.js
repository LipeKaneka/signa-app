import { requestApi } from "./http-client.js";

/**
 * POST /auth/register. @returns {Promise<{token, user}>} Usado por: AuthContext.register.
 */
export function registerAccount({ nickname, email, password, acceptedTerms }) {
  return requestApi("/auth/register", { method: "POST", body: { nickname, email, password, acceptedTerms } });
}

/**
 * POST /auth/login. @returns {Promise<{token, user}>} Usado por: AuthContext.signIn.
 */
export function signInAccount({ email, password }) {
  return requestApi("/auth/login", { method: "POST", body: { email, password } });
}

/**
 * GET /auth/session: confere se a conta ainda pode usar o app (401 = sessão inválida; 403 = conta banida).
 * @returns {Promise<{active: true}>} Usado por: AuthContext (conferência periódica).
 */
export function checkSession() {
  return requestApi("/auth/session");
}

/**
 * GET /profile. @returns {Promise<{user, achievements}>} Usado por: AuthContext (sessão) e ProfilePage (conquistas).
 */
export function fetchProfile() {
  return requestApi("/profile");
}

/**
 * PATCH /profile. @param {{nickname?, city?, showInRanking?, email?, password?, currentPassword?}} changes
 * @returns {Promise<{user}>} Usado por: ProfilePage (editar nome/cidade).
 */
export function updateProfile(changes) {
  return requestApi("/profile", { method: "PATCH", body: changes });
}

/**
 * DELETE /profile (exige a senha atual). Usado por: SettingsPage.
 */
export function deleteAccount(currentPassword) {
  return requestApi("/profile", { method: "DELETE", body: { currentPassword } });
}

/**
 * POST /auth/password-reset/request. Envia o código de 6 dígitos (resposta igual exista ou não a conta).
 * Usado por: ForgotPasswordPage e ResetCodePage (reenviar).
 */
export function requestPasswordReset(email) {
  return requestApi("/auth/password-reset/request", { method: "POST", body: { email } });
}

/**
 * POST /auth/password-reset/verify. Confere o código sem gastá-lo. Usado por: ResetCodePage.
 */
export function verifyPasswordReset(email, code) {
  return requestApi("/auth/password-reset/verify", { method: "POST", body: { email, code } });
}

/**
 * POST /auth/password-reset/confirm. @returns {Promise<{token, user}>} troca a senha e já entra.
 * Usado por: NewPasswordPage.
 */
export function confirmPasswordReset(email, code, password) {
  return requestApi("/auth/password-reset/confirm", { method: "POST", body: { email, code, password } });
}
