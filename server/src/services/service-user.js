import bcrypt from "bcryptjs";
import { UserModel } from "../models/model-user.js";
import { AttemptModel } from "../models/model-attempt.js";
import { PASSWORD_RULES } from "../config/rules.js";
import { generatePublicId } from "../utils/util-generators.js";
import { conflict, unauthorized, badRequest, HttpError } from "../utils/util-http-error.js";
import { readCurrentStreak } from "./service-streak.js";
import { readAchievementMetrics, listAchievementsWithProgress, recordUnlockDates, withUnlockDates } from "./service-achievement.js";
import { countCompletedModules } from "./service-trail.js";
import { describeLevel } from "./service-level.js";

/**
 * Dados do usuário que podem sair na API (nunca hash de senha nem _id).
 * @param {object} user
 * @returns {{publicId, nickname, email, city, showInRanking, xp, streak, maxStreak, totalCorrectAnswers, completedActivities, createdAt}}
 * Usado por: cadastro, login, perfil, fim da atividade.
 */
export function toPublicProfile(user) {
  return {
    publicId: user.publicId,
    nickname: user.nickname,
    email: user.email,
    city: user.city,
    avatar: user.avatar ?? "",
    showInRanking: user.showInRanking,
    xp: user.xp,
    streak: readCurrentStreak(user),
    maxStreak: user.maxStreak,
    totalCorrectAnswers: user.totalCorrectAnswers,
    completedActivities: user.completedActivitiesCount,
    createdAt: user.createdAt,
  };
}

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
  if (await UserModel.exists({ email })) throw conflict("Este e-mail já está cadastrado.");

  const passwordHash = await bcrypt.hash(password, PASSWORD_RULES.BCRYPT_ROUNDS);
  const user = await UserModel.create({
    publicId: await generateUniquePublicId(nickname),
    nickname,
    email,
    passwordHash,
    termsAcceptedAt: acceptedTerms ? new Date() : null,
    lastLogin: new Date(),
  });
  return { id: String(user._id), user: { ...toPublicProfile(user), level: await describeLevel(user.xp) } };
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
  if (ban) throw new HttpError(403, "Conta banida.", { code: "account_banned", ban });
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
  const passwordMatches = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!passwordMatches) throw unauthorized("E-mail ou senha incorretos.");
  await ensureNotBanned(user);

  user.lastLogin = new Date();
  await user.save();
  return { id: String(user._id), user: { ...toPublicProfile(user), level: await describeLevel(user.xp) } };
}

/**
 * Usuário ativo pelo id interno: base de toda rota de usuário da API interna.
 * @param {string} userId
 * @returns {Promise<object>} documento do usuário.
 * @throws {HttpError} 401 se não existir (sessão inválida); 403 se estiver banido (com motivo e prazo).
 * Usado por: middleware loadUser (rotas /internal/v1/users/:userId/...).
 */
export async function findActiveUserById(userId) {
  const user = await UserModel.findById(userId);
  if (!user) throw unauthorized("Sessão inválida. Entre novamente.");
  await ensureNotBanned(user);
  return user;
}

/**
 * Perfil (com o nível calculado pelo XP) + lista de conquistas ativas com progresso e data do desbloqueio.
 * @param {object} user
 * @returns {Promise<{user: object, achievements: object[]}>} user.level = {level, title, minXp, nextLevelXp};
 *   cada conquista traz unlockedAt (data, ou null se bloqueada).
 * Usado por: GET /internal/v1/users/:userId/profile (o app chama GET /profile no backend).
 */
export async function getProfileWithAchievements(user) {
  const completedModules = await countCompletedModules(user);
  const metrics = readAchievementMetrics(user, completedModules);
  const achievements = await listAchievementsWithProgress(metrics);
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
    throw badRequest("Informe a senha atual para trocar e-mail ou senha.");
  }
  const user = await UserModel.findById(userId).select("+passwordHash");
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw unauthorized("Senha atual incorreta.");
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
    if (await UserModel.exists({ email: changes.email })) throw conflict("Este e-mail já está cadastrado.");
    user.email = changes.email;
  }
  if (changes.password !== undefined) {
    user.passwordHash = await bcrypt.hash(changes.password, PASSWORD_RULES.BCRYPT_ROUNDS);
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
  await UserModel.deleteOne({ _id: user._id });
}
