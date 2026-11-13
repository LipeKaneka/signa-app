import { UserModel } from "../models/model-user.js";
import { AttemptModel } from "../models/model-attempt.js";
import { ActivityModel } from "../models/model-activity.js";
import { escapeRegExp } from "../utils/util-text.js";
import { badRequest, conflict, notFound } from "../utils/util-http-error.js";
import { recordAudit } from "./service-audit.js";
import { notifyUser, notifyAchievements, notifyLevelUp } from "./service-notification.js";
import { describeLevel } from "./service-level.js";
import { toPublicProfile, getProfileWithAchievements, readActiveBan } from "./service-user.js";
import { buildTrail } from "./service-trail.js";
import { listActiveAchievements, readUserAchievementMetrics, countActiveSigns } from "./service-achievement.js";
import { ACHIEVEMENT_METRICS, APP_EVENT_METRICS } from "../config/achievement-metrics.js";
import { SignModel } from "../models/model-sign.js";
import { toDayKey } from "./service-streak.js";

/** Maior número aceito em XP, ofensiva e acertos (sem teto prático; é o maior inteiro exato do JavaScript). */
export const MAX_COUNTER = Number.MAX_SAFE_INTEGER;

/** Maior prazo de banimento com data (10 anos); acima disso, use "sem prazo". */
export const MAX_BAN_DAYS = 3650;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Banimento para o painel: motivo, prazo (null = sem prazo) e quando foi aplicado. null se não estiver banido
 * (inclusive quando o prazo já venceu e a pessoa ainda não voltou a entrar).
 */
function toAdminBan(user) {
  const ban = readActiveBan(user);
  return ban ? { ...ban, bannedAt: user.ban?.bannedAt ?? null } : null;
}

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
    status: readActiveBan(user) ? "blocked" : "active",
    ban: toAdminBan(user),
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
  // Banimento com prazo vencido conta como ativo (a conta só volta a "active" no próximo acesso da pessoa).
  const now = new Date();
  const banValid = [{ "ban.until": null }, { "ban.until": { $gt: now } }];
  const conditions = [];
  if (status === "blocked") conditions.push({ status: "blocked", $or: banValid });
  if (status === "active") conditions.push({ $or: [{ status: "active" }, { status: "blocked", "ban.until": { $lte: now } }] });
  if (search) {
    const pattern = { $regex: escapeRegExp(search), $options: "i" };
    conditions.push({ $or: [{ nickname: pattern }, { email: pattern }, { publicId: pattern }] });
  }
  const filter = conditions.length ? { $and: conditions } : {};
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
/** Métrica → como o painel edita: "stats" (formulário de XP/ofensiva/acertos), "action" (contador de ação do app),
 *  "dictionary" (zerar / marcar todos) ou null (vem das atividades concluídas: edite pela lista de atividades). */
const STAT_METRICS = new Set(["xp", "streak", "totalCorrectAnswers"]);
const ACTION_BY_METRIC = new Map(Object.entries(APP_EVENT_METRICS).map(([type, metric]) => [metric, type]));

/**
 * Todos os "marcadores" que uma conquista pode medir, com o valor atual do usuário e como editar.
 * @param {object} user
 * @returns {Promise<{metrics: {id, label, group, value, edit, actionType?}[], totalSigns: number}>}
 */
async function describeAchievementMetrics(user) {
  const [values, totalSigns] = await Promise.all([readUserAchievementMetrics(user), countActiveSigns()]);
  const metrics = ACHIEVEMENT_METRICS.map((metric) => {
    const actionType = ACTION_BY_METRIC.get(metric.id);
    const edit = STAT_METRICS.has(metric.id) ? "stats" : actionType ? "action" : metric.group === "Dicionário" ? "dictionary" : null;
    return { id: metric.id, label: metric.label, group: metric.group, value: values[metric.id] ?? 0, edit, ...(actionType ? { actionType } : {}) };
  });
  return { metrics, totalSigns };
}

export async function getUserDetail(userId) {
  const user = await UserModel.findById(userId);
  if (!user) throw notFound("Usuário não encontrado.");
  const { user: profile, achievements } = await getProfileWithAchievements(user);
  const trail = await buildTrail(user);
  const attempts = await AttemptModel.find({ user: user._id }).sort({ createdAt: -1 }).limit(RECENT_ATTEMPTS).lean();
  const activityIds = [...new Set([...attempts.map((a) => String(a.activity)), ...user.completedActivities.map((c) => String(c.activity))])];
  const activities = await ActivityModel.find({ _id: { $in: activityIds } }).select("title").lean();
  const titles = new Map(activities.map((activity) => [String(activity._id), activity.title]));

  return {
    id: String(user._id),
    ...profile,
    status: readActiveBan(user) ? "blocked" : "active",
    ban: toAdminBan(user),
    lastLogin: user.lastLogin,
    lastActivityDay: user.lastActivityDay,
    storedStreak: user.streak,
    achievements,
    achievementMetrics: await describeAchievementMetrics(user),
    modules: trail.map((module) => ({
      id: module.id,
      title: module.title,
      status: module.status,
      completedActivities: module.completedActivities,
      totalActivities: module.totalActivities,
      activities: module.activities.map(({ id, title, order, status, bestScore }) => ({ id, title, order, status, bestScore })),
    })),
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
    actionCounts: Object.fromEntries(user.actionCounts ?? []),
    viewedSigns: user.viewedSigns?.length ?? 0,
  };
}

/**
 * Bane (bloqueia) ou desbloqueia um usuário do app. Banido é tirado da conta (o app confere a sessão a cada
 * ~20 s) e, ao tentar entrar, vê o motivo e até quando vale. Com prazo, a conta volta sozinha quando ele vence.
 * @param {object} actor
 * @param {string} userId
 * @param {"active"|"blocked"} status
 * @param {string} reason - vai para a auditoria e, no banimento, aparece para o usuário.
 * @param {number|null} [durationDays] - dias de banimento; null = sem prazo. Ignorado ao desbloquear.
 * @returns {Promise<object>}
 * Usado por: PATCH /admin/api/v1/users/:id/status.
 */
export async function setUserStatus(actor, userId, status, reason, durationDays = null) {
  if (!["active", "blocked"].includes(status)) throw badRequest("Status inválido.");
  const user = await findUser(userId);
  const before = snapshotProgress(user);
  const wasBlocked = user.status === "blocked";
  user.status = status;
  const now = Date.now();
  user.ban = status === "blocked"
    ? { reason, until: durationDays ? new Date(now + durationDays * DAY_MS) : null, bannedAt: new Date(now) }
    : null;
  await user.save();
  const period = status !== "blocked" ? "" : durationDays ? ` (por ${durationDays} ${durationDays === 1 ? "dia" : "dias"})` : " (sem prazo)";
  await recordAudit(actor, {
    action: status === "blocked" ? "block" : "unblock",
    entity: "user",
    entityId: user._id,
    summary: `${user.nickname} (${user.email}): ${reason}${period}`,
    before,
    after: snapshotProgress(user),
  });
  if (wasBlocked && status === "active") await notifyUser(user._id, "account_restored");
  return toAdminUserRow(user);
}

/**
 * Soma (ou tira) XP de um usuário, com motivo obrigatório. Sem limite de quantidade; o XP nunca fica negativo.
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
  const levelBefore = await describeLevel(user.xp);
  user.xp = Math.min(Math.max(0, user.xp + delta), MAX_COUNTER);
  await user.save();
  if (delta > 0) {
    await notifyUser(user._id, "xp_bonus", { xp: delta.toLocaleString("pt-BR") });
    await notifyLevelUp(user._id, levelBefore, await describeLevel(user.xp));
  }
  await recordAudit(actor, {
    action: "adjust_xp",
    entity: "user",
    entityId: user._id,
    summary: `${user.nickname}: ${delta > 0 ? "+" : ""}${delta.toLocaleString("pt-BR")} XP (${reason})`,
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

/**
 * Grava a alteração e a auditoria (antes/depois) de uma vez.
 * @param {object} actor
 * @param {object} user - documento já alterado (é salvo aqui).
 * @param {object} before - snapshotProgress de antes.
 * @param {string} action
 * @param {string} summary
 * @returns {Promise<object>} linha do usuário para o painel.
 */
async function saveWithAudit(actor, user, before, action, summary) {
  await user.save();
  await recordAudit(actor, { action, entity: "user", entityId: user._id, summary, before, after: snapshotProgress(user) });
  return toAdminUserRow(user);
}

/**
 * Edita dados do perfil (apelido, e-mail, cidade, aparecer no ranking). Só os campos enviados mudam.
 * @param {object} actor
 * @param {string} userId
 * @param {{nickname?: string, email?: string, city?: string, showInRanking?: boolean}} changes - já validados.
 * @param {string} reason
 * @returns {Promise<object>}
 * @throws {HttpError} 409 se o e-mail já for de outra conta.
 * Usado por: PATCH /admin/api/v1/users/:id/profile.
 */
export async function updateUserProfile(actor, userId, changes, reason) {
  const user = await findUser(userId);
  const before = { ...snapshotProgress(user), nickname: user.nickname, email: user.email, city: user.city, showInRanking: user.showInRanking };
  if (changes.email !== undefined && changes.email !== user.email && (await UserModel.exists({ email: changes.email, _id: { $ne: user._id } }))) {
    throw conflict("Este e-mail já é de outra conta.");
  }
  const changed = Object.entries(changes).filter(([field, value]) => value !== undefined && user[field] !== value);
  if (changed.length === 0) throw badRequest("Nada mudou.");
  changed.forEach(([field, value]) => {
    user[field] = value;
  });
  const fields = changed.map(([field]) => ({ nickname: "apelido", email: "e-mail", city: "cidade", showInRanking: "ranking" })[field]).join(", ");
  await user.save();
  await recordAudit(actor, {
    action: "update",
    entity: "user",
    entityId: user._id,
    summary: `${before.nickname}: perfil alterado (${fields}) — ${reason}`,
    before,
    after: { ...snapshotProgress(user), nickname: user.nickname, email: user.email, city: user.city, showInRanking: user.showInRanking },
  });
  return toAdminUserRow(user);
}

/**
 * Define números do progresso com o valor exato (sem limite): XP, ofensiva atual, maior ofensiva e acertos.
 * A ofensiva atual vale a partir de hoje (a pessoa precisa estudar amanhã para não perder); a maior ofensiva nunca
 * fica abaixo da atual.
 * @param {object} actor
 * @param {string} userId
 * @param {{xp?: number, streak?: number, maxStreak?: number, totalCorrectAnswers?: number}} values - inteiros >= 0.
 * @param {string} reason
 * @returns {Promise<object>}
 * Usado por: PATCH /admin/api/v1/users/:id/stats.
 */
export async function updateUserStats(actor, userId, values, reason) {
  const user = await findUser(userId);
  const before = snapshotProgress(user);
  if (values.xp !== undefined) user.xp = values.xp;
  if (values.totalCorrectAnswers !== undefined) user.totalCorrectAnswers = values.totalCorrectAnswers;
  if (values.streak !== undefined) {
    user.streak = values.streak;
    user.lastActivityDay = values.streak > 0 ? toDayKey(new Date()) : null;
  }
  if (values.maxStreak !== undefined) user.maxStreak = values.maxStreak;
  user.maxStreak = Math.max(user.maxStreak, user.streak);
  const labels = { xp: "XP", streak: "ofensiva", maxStreak: "maior ofensiva", totalCorrectAnswers: "acertos" };
  const described = Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([field, value]) => `${labels[field]} ${before[field] ?? "?"} → ${value}`)
    .join(", ");
  if (!described) throw badRequest("Nada mudou.");
  return saveWithAudit(actor, user, before, "update", `${user.nickname}: ${described} (${reason})`);
}

/**
 * Define os contadores de ações do app (toques na logo, no fogo, no XP, perguntas ao assistente...) com o valor
 * exato e/ou zera ou completa os sinais vistos no dicionário. Conquistas ligadas a eles passam a valer na hora.
 * @param {object} actor
 * @param {string} userId
 * @param {{actions?: Record<string, number>, dictionary?: "all"|"none"}} changes - já validados (tipos de APP_EVENT_METRICS).
 * @param {string} reason
 * @returns {Promise<object>}
 * Usado por: PATCH /admin/api/v1/users/:id/counters.
 */
export async function updateUserCounters(actor, userId, { actions = {}, dictionary }, reason) {
  const user = await findUser(userId);
  const before = snapshotProgress(user);
  const described = [];
  for (const [type, value] of Object.entries(actions)) {
    const previous = user.actionCounts?.get(type) ?? 0;
    if (previous === value) continue;
    user.actionCounts.set(type, value);
    const label = ACHIEVEMENT_METRICS.find((metric) => metric.id === APP_EVENT_METRICS[type])?.label ?? type;
    described.push(`${label} ${previous} → ${value}`);
  }
  if (dictionary === "none" && user.viewedSigns.length > 0) {
    described.push(`dicionário ${user.viewedSigns.length} → 0 sinais vistos`);
    user.viewedSigns = [];
  } else if (dictionary === "all") {
    const slugs = await SignModel.distinct("slug", { active: { $ne: false } });
    described.push(`dicionário ${user.viewedSigns.length} → ${slugs.length} sinais vistos (todos)`);
    user.viewedSigns = slugs;
  }
  if (described.length === 0) throw badRequest("Nada mudou.");
  return saveWithAudit(actor, user, before, "update", `${user.nickname}: ${described.join(", ")} (${reason})`);
}

/**
 * Marca uma atividade como concluída (com a nota) ou tira a conclusão. Concluir libera o que depende dela na trilha.
 * @param {object} actor
 * @param {string} userId
 * @param {string} activityId
 * @param {{completed: boolean, bestScore?: number}} change - bestScore 0-100 (padrão 100).
 * @param {string} reason
 * @returns {Promise<object>}
 * @throws {HttpError} 404 atividade inexistente.
 * Usado por: PUT /admin/api/v1/users/:id/activities/:activityId.
 */
export async function setUserActivity(actor, userId, activityId, { completed, bestScore = 100 }, reason) {
  const [user, activity] = await Promise.all([findUser(userId), ActivityModel.findById(activityId).select("title").lean()]);
  if (!activity) throw notFound("Atividade não encontrada.");
  const before = snapshotProgress(user);
  const index = user.completedActivities.findIndex((entry) => String(entry.activity) === String(activity._id));
  if (completed) {
    if (index === -1) user.completedActivities.push({ activity: activity._id, bestScore, completedAt: new Date() });
    else user.completedActivities[index].bestScore = bestScore;
  } else {
    if (index === -1) throw badRequest("Esta atividade já não está concluída.");
    user.completedActivities.splice(index, 1);
  }
  user.completedActivitiesCount = user.completedActivities.length;
  const what = completed ? `marcou "${activity.title}" como concluída (${bestScore}%)` : `tirou a conclusão de "${activity.title}"`;
  return saveWithAudit(actor, user, before, "update", `${user.nickname}: ${what} (${reason})`);
}

/**
 * Dá, tira ou devolve ao automático uma conquista do usuário.
 * - granted: desbloqueada (com a data de hoje, se ainda não tinha).
 * - revoked: bloqueada mesmo que a meta tenha sido alcançada (a data some).
 * - auto: volta a valer a meta normal.
 * @param {object} actor
 * @param {string} userId
 * @param {string} key - chave da conquista.
 * @param {"granted"|"revoked"|"auto"} mode
 * @param {string} reason
 * @returns {Promise<object>}
 * @throws {HttpError} 400 modo inválido; 404 conquista inexistente.
 * Usado por: PUT /admin/api/v1/users/:id/achievements/:key.
 */
export async function setUserAchievement(actor, userId, key, mode, reason) {
  if (!["granted", "revoked", "auto"].includes(mode)) throw badRequest("Use granted, revoked ou auto.");
  const [user, catalog] = await Promise.all([findUser(userId), listActiveAchievements()]);
  const achievement = catalog.find((entry) => entry.key === key);
  if (!achievement) throw notFound("Conquista não encontrada (ou desativada).");
  const before = snapshotProgress(user);
  user.achievementOverrides = user.achievementOverrides.filter((entry) => entry.key !== key);
  if (mode !== "auto") user.achievementOverrides.push({ key, unlocked: mode === "granted" });
  const newlyGranted = mode === "granted" && !user.achievementUnlocks.some((entry) => entry.key === key);
  if (newlyGranted) user.achievementUnlocks.push({ key, unlockedAt: new Date() });
  if (mode === "revoked") user.achievementUnlocks = user.achievementUnlocks.filter((entry) => entry.key !== key);
  const what = { granted: "deu", revoked: "tirou", auto: "voltou ao automático" }[mode];
  const row = await saveWithAudit(actor, user, before, "update", `${user.nickname}: ${what} a conquista "${achievement.title}" (${reason})`);
  if (newlyGranted) await notifyAchievements(user._id, [achievement]);
  return row;
}
