import * as UserService from "../services/service-user.js";
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
import { forgetSession } from "../middlewares/auth-middleware.js";

/**
 * POST /auth/register — valida {nickname, email, password, acceptedTerms: true} e responde 201 {message, token, user}.
 * Sem o aceite do Termo de Uso a conta não é criada (400).
 */
export async function createAccount(req, res) {
  const nickname = readRequiredString(req.body?.nickname, "o apelido", 60);
  const email = readEmail(req.body?.email);
  const password = readNewPassword(req.body?.password);
  if (readBoolean(req.body?.acceptedTerms, "O aceite do Termo de Uso") !== true) {
    throw badRequest("Para criar a conta, aceite o Termo de Uso.");
  }

  const session = await UserService.createAccount({ nickname, email, password, acceptedTerms: true });
  res.status(201).json({ message: "Conta criada.", ...session });
}

/**
 * POST /auth/login — valida {email, password} e responde {message, token, user}.
 */
export async function signIn(req, res) {
  const email = readEmail(req.body?.email);
  const password = readRequiredString(req.body?.password, "a senha", 128);

  const session = await UserService.signIn({ email, password });
  res.json({ message: "Bem-vindo de volta!", ...session });
}

/**
 * GET /profile — responde {user, achievements}.
 */
export async function getProfile(req, res) {
  const profile = await UserService.getProfileWithAchievements(req.userId);
  res.json(profile);
}

const EDITABLE_FIELDS = ["nickname", "email", "password", "city", "showInRanking", "avatar", "avatarThumb", "currentPassword"];

/**
 * Valida o corpo do PATCH /profile: só aceita campos editáveis (recusa xp, status etc.).
 * @returns {{nickname?, email?, password?, city?, showInRanking?, avatar?, avatarThumb?}}
 * @throws {HttpError} 400 em campo desconhecido ou inválido.
 */
function readProfileChanges(body) {
  const unknownField = Object.keys(body ?? {}).find((field) => !EDITABLE_FIELDS.includes(field));
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

/**
 * PATCH /profile — responde {message, user}.
 */
export async function updateProfile(req, res) {
  const changes = readProfileChanges(req.body);
  const user = await UserService.updateProfile(req.userId, changes, req.body?.currentPassword);
  res.json({ message: "Perfil atualizado.", user });
}

/**
 * DELETE /profile — exige {currentPassword}; responde {message}.
 */
export async function deleteAccount(req, res) {
  await UserService.deleteAccount(req.userId, req.body?.currentPassword);
  forgetSession(req.userId);
  res.json({ message: "Conta excluída." });
}

/** Lê o código de 6 dígitos. @throws {HttpError} 400. */
function readResetCode(value) {
  if (typeof value !== "string" || !/^\d{6}$/.test(value)) throw badRequest("Informe o código de 6 dígitos.");
  return value;
}

/**
 * POST /auth/password-reset/request — {email}; responde sempre a mesma mensagem (não revela quem tem conta).
 */
export async function requestPasswordReset(req, res) {
  await UserService.requestPasswordReset(readEmail(req.body?.email));
  res.json({ message: "Se o e-mail tiver conta, enviamos um código de 6 dígitos." });
}

/**
 * POST /auth/password-reset/verify — {email, code}; responde {valid: true} ou 400.
 */
export async function verifyPasswordReset(req, res) {
  await UserService.verifyPasswordReset(readEmail(req.body?.email), readResetCode(req.body?.code));
  res.json({ valid: true });
}

/**
 * POST /auth/password-reset/confirm — {email, code, password}; troca a senha e responde {message, token, user}.
 */
export async function confirmPasswordReset(req, res) {
  const session = await UserService.confirmPasswordReset(
    readEmail(req.body?.email),
    readResetCode(req.body?.code),
    readNewPassword(req.body?.password),
  );
  res.json({ message: "Senha alterada.", ...session });
}
