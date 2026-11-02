import { UserModel } from "../models/model-user.js";
import { AttemptModel } from "../models/model-attempt.js";
import { ActivityModel } from "../models/model-activity.js";
import { escapeRegExp } from "../utils/util-text.js";
import { badRequest, notFound } from "../utils/util-http-error.js";
import { recordAudit } from "./service-audit.js";
import { toPublicProfile, getProfileWithAchievements } from "./service-user.js";

const RECENT_ATTEMPTS = 20;

/**
 * Usuário do app no formato da lista do painel.
 * @param {object} user
 * @returns {object}
 */
function toAdminUserRow(user) {
  return {
    id: String(user._id),
    ...toPublicProfile(user),
    status: user.status,
    lastLogin: user.lastLogin,
  };
}

/**
 * Usuários do app com busca (apelido, e-mail ou id público) e filtro de status.
 * @param {{search?: string, status?: "active"|"blocked", page: number, limit: number}} query
 * @returns {Promise<{users: object[], total: number, page: number, pages: number}>}
 * Usado por: GET /admin/api/v1/users.
 */
export async function listUsers({ search, status, page, limit }) {
  const filter = {};
  if (status) filter.status = status;
  if (search) {
    const pattern = { $regex: escapeRegExp(search), $options: "i" };
    filter.$or = [{ nickname: pattern }, { email: pattern }, { publicId: pattern }];
  }
  const [users, total] = await Promise.all([
    UserModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    UserModel.countDocuments(filter),
  ]);
  return { users: users.map(toAdminUserRow), total, page, pages: Math.max(Math.ceil(total / limit), 1) };
}

/**
 * Detalhe de um usuário: perfil, nível, conquistas, atividades concluídas e últimas tentativas.
 * @param {string} userId
 * @returns {Promise<object>}
 * @throws {HttpError} 404.
 * Usado por: GET /admin/api/v1/users/:id.
 */
export async function getUserDetail(userId) {
  const user = await UserModel.findById(userId);
  if (!user) throw notFound("Usuário não encontrado.");
  const { user: profile, achievements } = await getProfileWithAchievements(user);
  const attempts = await AttemptModel.find({ user: user._id }).sort({ createdAt: -1 }).limit(RECENT_ATTEMPTS).lean();
  const activityIds = [...new Set([...attempts.map((a) => String(a.activity)), ...user.completedActivities.map((c) => String(c.activity))])];
  const activities = await ActivityModel.find({ _id: { $in: activityIds } }).select("title").lean();
  const titles = new Map(activities.map((activity) => [String(activity._id), activity.title]));

  return {
    id: String(user._id),
    ...profile,
    status: user.status,
    lastLogin: user.lastLogin,
    achievements,
    completedActivities: user.completedActivities.map((entry) => ({
      activityId: String(entry.activity),
      title: titles.get(String(entry.activity)) ?? "(atividade excluída)",
      bestScore: entry.bestScore,
      completedAt: entry.completedAt,
    })),
    recentAttempts: attempts.map((attempt) => ({
      id: String(attempt._id),
      activityTitle: titles.get(String(attempt.activity)) ?? "(atividade excluída)",
      status: attempt.status,
      score: attempt.result?.score ?? null,
      xpEarned: attempt.result?.xpEarned ?? null,
      createdAt: attempt.createdAt,
    })),
  };
}

/**
 * Busca o usuário ou 404.
 * @param {string} userId
 * @returns {Promise<object>}
 */
async function findUser(userId) {
  const user = await UserModel.findById(userId);
  if (!user) throw notFound("Usuário não encontrado.");
  return user;
}

/** Métricas de progresso guardadas na auditoria antes de mexer no usuário. */
function snapshotProgress(user) {
  return {
    status: user.status,
    xp: user.xp,
    streak: user.streak,
    maxStreak: user.maxStreak,
    totalCorrectAnswers: user.totalCorrectAnswers,
    completedActivitiesCount: user.completedActivitiesCount,
  };
}

/**
 * Bloqueia ou desbloqueia um usuário do app. Bloqueado não entra, e a sessão aberta cai em até 30 s
 * (cache de sessão do backend).
 * @param {object} actor
 * @param {string} userId
 * @param {"active"|"blocked"} status
 * @param {string} reason
 * @returns {Promise<object>}
 * Usado por: PATCH /admin/api/v1/users/:id/status.
 */
export async function setUserStatus(actor, userId, status, reason) {
  if (!["active", "blocked"].includes(status)) throw badRequest("Status inválido.");
  const user = await findUser(userId);
  const before = snapshotProgress(user);
  user.status = status;
  await user.save();
  await recordAudit(actor, {
    action: status === "blocked" ? "block" : "unblock",
    entity: "user",
    entityId: user._id,
    summary: `${user.nickname} (${user.email}): ${reason}`,
    before,
    after: snapshotProgress(user),
  });
  return toAdminUserRow(user);
}

/**
 * Soma (ou tira) XP de um usuário, com motivo obrigatório. O XP nunca fica negativo.
 * @param {object} actor
 * @param {string} userId
 * @param {number} delta - inteiro, positivo ou negativo.
 * @param {string} reason
 * @returns {Promise<object>}
 * Usado por: POST /admin/api/v1/users/:id/xp.
 */
export async function adjustUserXp(actor, userId, delta, reason) {
  const user = await findUser(userId);
  const before = snapshotProgress(user);
  user.xp = Math.max(0, user.xp + delta);
  await user.save();
  await recordAudit(actor, {
    action: "adjust_xp",
    entity: "user",
    entityId: user._id,
    summary: `${user.nickname}: ${delta > 0 ? "+" : ""}${delta} XP (${reason})`,
    before,
    after: snapshotProgress(user),
  });
  return toAdminUserRow(user);
}

/**
 * Zera o progresso de um usuário (XP, ofensiva, acertos, atividades concluídas, histórico de ranking)
 * e apaga as tentativas dele. A conta continua existindo.
 * @param {object} actor
 * @param {string} userId
 * @param {string} reason
 * @returns {Promise<object>}
 * Usado por: POST /admin/api/v1/users/:id/reset-progress.
 */
export async function resetUserProgress(actor, userId, reason) {
  const user = await findUser(userId);
  const before = snapshotProgress(user);
  Object.assign(user, {
    xp: 0,
    streak: 0,
    maxStreak: 0,
    lastActivityDay: null,
    totalCorrectAnswers: 0,
    completedActivities: [],
    completedActivitiesCount: 0,
    rankingPositions: { activities: {}, xp: {}, streak: {} },
  });
  await user.save();
  const { deletedCount } = await AttemptModel.deleteMany({ user: user._id });
  await recordAudit(actor, {
    action: "reset_progress",
    entity: "user",
    entityId: user._id,
    summary: `${user.nickname}: progresso zerado, ${deletedCount} tentativas apagadas (${reason})`,
    before,
    after: snapshotProgress(user),
  });
  return toAdminUserRow(user);
}
