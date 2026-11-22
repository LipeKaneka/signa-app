import { hashPassword, verifyPassword } from "../utils/util-password.js";
import { NotificationModel } from "../models/model-notification.js";
import { randomBytes } from "node:crypto";
import { UserModel } from "../models/model-user.js";
import { AttemptModel } from "../models/model-attempt.js";
import { generatePublicId } from "../utils/util-generators.js";
import { conflict, unauthorized, badRequest, HttpError } from "../utils/util-http-error.js";
import { readCurrentStreak } from "./service-streak.js";
import { readUserAchievementMetrics, readAchievementOverrides, listAchievementsWithProgress, recordUnlockDates, withUnlockDates } from "./service-achievement.js";
import { describeLevel } from "./service-level.js";
import { verifyGoogleIdToken } from "./service-google-auth.js";
import { assertAppAccess } from "./service-popups.js";
import { MESSAGES } from "../config/messages.js";

/**
 * Dados do usuário que podem sair na API (nunca hash de senha nem _id).
 * @param {object} user
 * @param {{withAvatar?: boolean}} [options] - withAvatar: false = sem a foto (respostas que o app não usa para mostrá-la).
 * @returns {{publicId, nickname, email, city, showInRanking, xp, streak, maxStreak, totalCorrectAnswers, completedActivities, createdAt}}
 * Usado por: cadastro, login, perfil, fim da atividade.
 */
export function toPublicProfile(user, { withAvatar = true } = {}) {
  return {
    publicId: user.publicId,
    nickname: user.nickname,
    email: user.email,
    city: user.city,
    // A foto (até 60 KB) só vai onde o app mostra: perfil e edição do perfil. Login, cadastro e fim de atividade
    // mandam sem ela (o app guarda a foto do perfil e mescla o resto por cima).
    ...(withAvatar ? { avatar: user.avatar ?? "" } : {}),
    showInRanking: user.showInRanking,
    xp: user.xp,
    streak: readCurrentStreak(user),
    maxStreak: user.maxStreak,
    totalCorrectAnswers: user.totalCorrectAnswers,
    completedActivities: user.completedActivitiesCount,
    createdAt: user.createdAt,
  };
}

/** Perfil das respostas de sessão (login, cadastro, Google, recuperação de senha, fim de atividade): sem a foto. */
export const SESSION_PROFILE = Object.freeze({ withAvatar: false });

/**
 * publicId que ainda não existe no banco (até 5 tentativas).
 * @returns {Promise<string>}
 */
async function generateUniquePublicId(nickname) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const publicId = generatePublicId(nickname);
    if (!(await UserModel.exists({ publicId }))) return publicId;
  }
  throw new Error("Não foi possível gerar um id público único.");
}

/**
 * Cria a conta (senha com bcrypt) e já devolve a sessão.
 * @param {{nickname: string, email: string, password: string, acceptedTerms?: boolean}} data - já validado pelo controller.
 * @returns {Promise<{id: string, user: object}>} id interno (o backend usa no token) + perfil público (com o nível).
 * @throws {HttpError} 409 se o e-mail já existir.
 */
export async function createAccount({ nickname, email, password, acceptedTerms = false }) {
  await assertAppAccess({ email });
  if (await UserModel.exists({ email })) throw conflict(MESSAGES.account.emailTaken);

  const passwordHash = await hashPassword(password);
  const user = await UserModel.create({
    publicId: await generateUniquePublicId(nickname),
    nickname,
    email,
    passwordHash,
    termsAcceptedAt: acceptedTerms ? new Date() : null,
    lastLogin: new Date(),
  });
  return { id: String(user._id), sessionVersion: user.sessionVersion ?? 0, user: { ...toPublicProfile(user, SESSION_PROFILE), level: await describeLevel(user.xp) } };
}

/**
 * Banimento valendo agora (status "blocked" e prazo ainda não vencido).
 * @param {object} user
 * @param {number} [now]
 * @returns {{reason: string, until: string|null}|null} until null = sem prazo; null = não está banido.
 * Usado por: login, sessão, recuperação de senha e painel.
 */
export function readActiveBan(user, now = Date.now()) {
  if (user.status !== "blocked") return null;
  const until = user.ban?.until ? new Date(user.ban.until) : null;
  if (until && until.getTime() <= now) return null;
  return { reason: user.ban?.reason ?? "", until: until ? until.toISOString() : null };
}

/**
 * Recusa conta banida com 403 + {code: "account_banned", ban: {reason, until}} (o app tira a pessoa da conta e
 * mostra o aviso). Banimento com prazo vencido é desfeito aqui mesmo.
 * @param {object} user - documento Mongoose (é salvo se o banimento venceu).
 * @returns {Promise<void>}
 * @throws {HttpError} 403.
 */
async function ensureNotBanned(user) {
  if (user.status !== "blocked") return;
  const ban = readActiveBan(user);
  if (ban) throw new HttpError(403, MESSAGES.account.banned, { code: "account_banned", ban });
  user.status = "active";
  user.ban = null;
  await user.save();
}

/**
 * Login. Mesma mensagem para e-mail inexistente e senha errada (não revela quem tem conta).
 * @returns {Promise<{id: string, user: object}>} id interno (o backend usa no token) + perfil público (com o nível).
 * @throws {HttpError} 401 credenciais erradas; 403 conta banida (com motivo e prazo).
 */
export async function signIn({ email, password }) {
  const user = await UserModel.findOne({ email }).select("+passwordHash");
  const passwordMatches = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!passwordMatches) throw unauthorized(MESSAGES.account.wrongCredentials);
  await ensureNotBanned(user);
  await assertAppAccess(user);

  user.lastLogin = new Date();
  await user.save();
  return { id: String(user._id), sessionVersion: user.sessionVersion ?? 0, user: { ...toPublicProfile(user, SESSION_PROFILE), level: await describeLevel(user.xp) } };
}

/**
 * Login com Google (o app manda o ID token que recebeu do Google).
 * - Conta com o mesmo Google: entra.
 * - Conta com o mesmo e-mail (criada com senha): liga o Google a ela e entra (o Google confirmou o e-mail).
 * - Nenhuma: cria a conta (exige o aceite do Termo de Uso), com uma senha aleatória que ninguém sabe; para ter
 *   senha, a pessoa usa "Esqueci minha senha".
 * @param {{idToken: string, acceptedTerms: boolean}} data
 * @returns {Promise<{id: string, user: object, created: boolean}>}
 * @throws {HttpError} 400 sem aceite (conta nova) ou Google desligado; 401 token inválido; 403 conta banida.
 * Usado por: POST /internal/v1/auth/google.
 */
export async function signInWithGoogle({ idToken, acceptedTerms }) {
  const google = await verifyGoogleIdToken(idToken);
  let user = (await UserModel.findOne({ googleId: google.googleId })) ?? (await UserModel.findOne({ email: google.email }));
  const created = !user;

  if (user) {
    await ensureNotBanned(user);
    await assertAppAccess(user);
    if (!user.googleId) user.googleId = google.googleId;
    user.lastLogin = new Date();
    await user.save();
  } else {
    if (!acceptedTerms) throw badRequest(MESSAGES.account.acceptTerms);
    await assertAppAccess({ email: google.email });
    const nickname = google.name.trim().slice(0, 60) || "Pessoa";
    user = await UserModel.create({
      publicId: await generateUniquePublicId(nickname),
      nickname,
      email: google.email,
      passwordHash: await hashPassword(randomBytes(32).toString("hex")),
      googleId: google.googleId,
      termsAcceptedAt: new Date(),
      lastLogin: new Date(),
    });
  }
  return { id: String(user._id), sessionVersion: user.sessionVersion ?? 0, user: { ...toPublicProfile(user, SESSION_PROFILE), level: await describeLevel(user.xp) }, created };
}

/**
 * Usuário ativo pelo id interno: base de toda rota de usuário da API interna.
 * @param {string} userId
 * @returns {Promise<object>} documento do usuário.
 * @throws {HttpError} 401 se não existir (sessão inválida); 403 se estiver banido (com motivo e prazo).
 * Usado por: middleware loadUser (rotas /internal/v1/users/:userId/...).
 */
/**
 * Confere a versão da sessão que veio no token do app (cabeçalho X-Session-Version, mandado pelo backend).
 * Sem o cabeçalho (chamada que não vem de um token do app), não confere.
 * @param {{sessionVersion?: number}} user
 * @param {string|undefined} tokenVersion
 * @throws {HttpError} 401 se a senha foi trocada depois que o token foi emitido.
 */
export function assertSessionVersion(user, tokenVersion) {
  if (tokenVersion === undefined || tokenVersion === null || tokenVersion === "") return;
  if (Number(tokenVersion) !== (user.sessionVersion ?? 0)) throw unauthorized(MESSAGES.account.sessionInvalid);
}

export async function findActiveUserById(userId) {
  const user = await UserModel.findById(userId);
  if (!user) throw unauthorized(MESSAGES.account.sessionInvalid);
  await ensureNotBanned(user);
  return user;
}

/**
 * Confere se a conta existe e está ativa lendo só status e banimento (sem a foto, as listas de progresso etc.):
 * é a consulta mais frequente do servidor (o backend confere a sessão a cada poucos segundos por pessoa).
 * @param {string} userId
 * @returns {Promise<void>}
 * @throws {HttpError} 401 se não existir; 403 se estiver banido (com motivo e prazo).
 * Usado por: GET /internal/v1/users/:userId/session.
 */
export async function ensureActiveSession(userId, tokenVersion) {
  const user = await UserModel.findById(userId).select("status ban email sessionVersion");
  if (!user) throw unauthorized(MESSAGES.account.sessionInvalid);
  assertSessionVersion(user, tokenVersion);
  await ensureNotBanned(user);
  await assertAppAccess(user);
}

/**
 * Perfil (com o nível calculado pelo XP) + lista de conquistas ativas com progresso e data do desbloqueio.
 * @param {object} user
 * @returns {Promise<{user: object, achievements: object[]}>} user.level = {level, title, minXp, nextLevelXp};
 *   cada conquista traz unlockedAt (data, ou null se bloqueada).
 * Usado por: GET /internal/v1/users/:userId/profile (o app chama GET /profile no backend).
 */
export async function getProfileWithAchievements(user) {
  const metrics = await readUserAchievementMetrics(user);
  const achievements = await listAchievementsWithProgress(metrics, readAchievementOverrides(user));
  if (recordUnlockDates(user, achievements)) await user.save();
  return {
    user: { ...toPublicProfile(user), level: await describeLevel(user.xp) },
    achievements: withUnlockDates(user, achievements),
  };
}

/**
 * Confere a senha atual antes de ações sensíveis.
 * @throws {HttpError} 400 sem senha; 401 senha errada.
 */
async function verifyCurrentPassword(userId, currentPassword) {
  if (typeof currentPassword !== "string" || currentPassword === "") {
    throw badRequest(MESSAGES.account.currentPasswordRequired);
  }
  const user = await UserModel.findById(userId).select("+passwordHash");
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    // 400, não 401: o app e o painel entendem 401 como sessão vencida e tirariam a pessoa da conta.
    throw badRequest(MESSAGES.account.currentPasswordWrong);
  }
}

/**
 * Atualiza o perfil. Trocar e-mail ou senha exige a senha atual.
 * @param {object} user
 * @param {{nickname?, email?, password?, city?, showInRanking?, avatar?, avatarThumb?}} changes - já validado ("" remove a foto).
 * @param {string} [currentPassword]
 * @returns {Promise<object>} perfil público atualizado.
 * @throws {HttpError} 400/401 (senha atual), 409 (e-mail em uso).
 */
export async function updateProfile(user, changes, currentPassword) {
  const changesCredentials = changes.email !== undefined || changes.password !== undefined;
  if (changesCredentials) await verifyCurrentPassword(user._id, currentPassword);

  if (changes.email !== undefined && changes.email !== user.email) {
    if (await UserModel.exists({ email: changes.email })) throw conflict(MESSAGES.account.emailTaken);
    user.email = changes.email;
  }
  if (changes.password !== undefined) {
    user.passwordHash = await hashPassword(changes.password);
    // Os outros aparelhos saem da conta; o backend dá um token novo a este (sessionVersion na resposta).
    user.sessionVersion = (user.sessionVersion ?? 0) + 1;
  }
  if (changes.nickname !== undefined) user.nickname = changes.nickname;
  if (changes.city !== undefined) user.city = changes.city;
  if (changes.showInRanking !== undefined) user.showInRanking = changes.showInRanking;
  if (changes.avatar !== undefined) user.avatar = changes.avatar;
  if (changes.avatarThumb !== undefined) user.avatarThumb = changes.avatarThumb;
  // Sem foto, sem miniatura (o ranking não mostra uma foto que a pessoa removeu).
  if (changes.avatar === "") user.avatarThumb = "";

  await user.save();
  return toPublicProfile(user);
}

/**
 * Exclui a conta e as tentativas do usuário (exige senha atual).
 * @returns {Promise<void>}
 */
export async function deleteAccount(user, currentPassword) {
  await verifyCurrentPassword(user._id, currentPassword);
  await AttemptModel.deleteMany({ user: user._id });
  await NotificationModel.deleteMany({ user: user._id });
  await UserModel.deleteOne({ _id: user._id });
}
