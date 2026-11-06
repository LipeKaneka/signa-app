import * as UserService from "../services/service-user.js";
import * as PasswordResetService from "../services/service-password-reset.js";
import {
  readRequiredString,
  readOptionalString,
  readEmail,
  readNewPassword,
  readBoolean,
  readAvatar,
  AVATAR_THUMB_MAX_LENGTH,
} from "../utils/util-validators.js";
import { badRequest } from "../utils/util-http-error.js";

/**
 * POST /internal/v1/auth/register — {nickname, email, password, acceptedTerms?} -> 201 {id, user}.
 * O backend gera o token do app a partir do id (e só chama com o Termo de Uso aceito; aqui guardamos a data do aceite).
 */
export async function register(req, res) {
  const nickname = readRequiredString(req.body?.nickname, "o apelido", 60);
  const email = readEmail(req.body?.email);
  const password = readNewPassword(req.body?.password);
  const acceptedTerms = readBoolean(req.body?.acceptedTerms, "acceptedTerms") === true;

  const account = await UserService.createAccount({ nickname, email, password, acceptedTerms });
  res.status(201).json(account);
}

/**
 * POST /internal/v1/auth/verify-credentials — {email, password} -> {id, user}.
 * 401 com a mesma mensagem para e-mail inexistente ou senha errada; 403 se bloqueado.
 */
export async function verifyCredentials(req, res) {
  const email = readEmail(req.body?.email);
  const password = readRequiredString(req.body?.password, "a senha", 128);

  const account = await UserService.signIn({ email, password });
  res.json(account);
}

/**
 * POST /internal/v1/auth/google — {idToken, acceptedTerms?} -> {id, user, created}.
 * 401 token do Google inválido; 403 conta banida; 400 conta nova sem o aceite do Termo de Uso.
 */
export async function googleSignIn(req, res) {
  const idToken = readRequiredString(req.body?.idToken, "o token do Google", 4096);
  const acceptedTerms = readBoolean(req.body?.acceptedTerms, "acceptedTerms") === true;
  res.json(await UserService.signInWithGoogle({ idToken, acceptedTerms }));
}

/**
 * GET /internal/v1/users/:userId/session — {active: true} se a conta existe e está ativa
 * (o loadUser já respondeu 401/403 caso contrário). Usado pelo backend para validar sessões.
 */
export function getSession(_req, res) {
  res.json({ active: true });
}

/** GET /internal/v1/users/:userId/profile — {user, achievements}. */
export async function getProfile(req, res) {
  res.json(await UserService.getProfileWithAchievements(req.user));
}

const EDITABLE_FIELDS = ["nickname", "email", "password", "city", "showInRanking", "avatar", "avatarThumb"];

/**
 * Valida as mudanças de perfil: só campos editáveis (recusa xp, status etc.).
 * @param {object} changes
 * @returns {{nickname?, email?, password?, city?, showInRanking?}}
 * @throws {HttpError} 400 em campo desconhecido ou inválido.
 */
function readProfileChanges(changes) {
  const body = changes ?? {};
  const unknownField = Object.keys(body).find((field) => !EDITABLE_FIELDS.includes(field));
  if (unknownField) throw badRequest(`Campo não pode ser alterado: ${unknownField}.`);

  return {
    nickname: body.nickname === undefined ? undefined : readRequiredString(body.nickname, "o apelido", 60),
    email: body.email === undefined ? undefined : readEmail(body.email),
    password: body.password === undefined ? undefined : readNewPassword(body.password),
    city: readOptionalString(body.city, "Cidade", 60),
    showInRanking: readBoolean(body.showInRanking, "Aparecer no ranking"),
    avatar: readAvatar(body.avatar),
    avatarThumb: readAvatar(body.avatarThumb, AVATAR_THUMB_MAX_LENGTH),
  };
}

/** PATCH /internal/v1/users/:userId — {changes, currentPassword?} -> {user}. */
export async function updateProfile(req, res) {
  const changes = readProfileChanges(req.body?.changes);
  const user = await UserService.updateProfile(req.user, changes, req.body?.currentPassword);
  res.json({ user });
}

/** DELETE /internal/v1/users/:userId — {currentPassword} -> {deleted: true}. */
export async function deleteUser(req, res) {
  await UserService.deleteAccount(req.user, req.body?.currentPassword);
  res.json({ deleted: true });
}

/** Lê o código de 6 dígitos. @throws {HttpError} 400. */
function readResetCode(value) {
  if (typeof value !== "string" || !/^\d{6}$/.test(value)) throw badRequest("Informe o código de 6 dígitos.");
  return value;
}

/** POST /internal/v1/auth/password-reset/request — {email} → {sent: true} (mesma resposta exista ou não a conta). */
export async function requestPasswordReset(req, res) {
  await PasswordResetService.requestPasswordReset(readEmail(req.body?.email));
  res.json({ sent: true });
}

/** POST /internal/v1/auth/password-reset/verify — {email, code} → {valid: true} ou 400. */
export async function verifyPasswordReset(req, res) {
  await PasswordResetService.verifyPasswordResetCode(readEmail(req.body?.email), readResetCode(req.body?.code));
  res.json({ valid: true });
}

/** POST /internal/v1/auth/password-reset/confirm — {email, code, password} → {changed: true}. */
export async function confirmPasswordReset(req, res) {
  await PasswordResetService.confirmPasswordReset(readEmail(req.body?.email), readResetCode(req.body?.code), readNewPassword(req.body?.password));
  res.json({ changed: true });
}
