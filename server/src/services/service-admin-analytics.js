import { UserModel } from "../models/model-user.js";
import { AttemptModel } from "../models/model-attempt.js";
import { ModuleModel } from "../models/model-module.js";
import { ActivityModel } from "../models/model-activity.js";
import { AuditLogModel } from "../models/model-audit-log.js";
import { toDayKey } from "./service-streak.js";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Fuso dos dias dos gráficos (o mesmo da ofensiva). */
const TIME_ZONE = "America/Sao_Paulo";
/** Períodos aceitos no dashboard, em dias. */
export const ANALYTICS_PERIODS = Object.freeze([7, 30, 90]);
/** Respostas mínimas para uma pergunta entrar no ranking de "mais difíceis" (evita 1 erro em 1 resposta = 0%). */
const MIN_ANSWERS_FOR_DIFFICULTY = 5;
const NOT_DEACTIVATED = Object.freeze({ active: { $ne: false } });

/** Lista de dias ("AAAA-MM-DD") do período, do mais antigo ao de hoje. */
function listDayKeys(days, now) {
  return Array.from({ length: days }, (_, index) => toDayKey(new Date(now.getTime() - (days - 1 - index) * DAY_MS)));
}

/** Variação percentual entre dois períodos (null quando o anterior é zero: não dá para comparar). */
function changeBetween(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Números de um intervalo de tempo: atividades concluídas, pessoas ativas, XP, taxa de acerto e cadastros.
 * @param {Date} from
 * @param {Date} to
 */
async function readPeriodTotals(from, to) {
  const [attempts] = await AttemptModel.aggregate([
    { $match: { status: "finished", finishedAt: { $gte: from, $lt: to } } },
    {
      $group: {
        _id: null,
        finished: { $sum: 1 },
        users: { $addToSet: "$user" },
        xp: { $sum: { $ifNull: ["$result.xpEarned", 0] } },
        correct: { $sum: { $ifNull: ["$result.correctAnswers", 0] } },
        total: { $sum: { $ifNull: ["$result.totalQuestions", 0] } },
        passed: { $sum: { $cond: ["$result.passed", 1, 0] } },
      },
    },
  ]);
  const newUsers = await UserModel.countDocuments({ createdAt: { $gte: from, $lt: to } });
  return {
    finishedAttempts: attempts?.finished ?? 0,
    activeUsers: attempts?.users.length ?? 0,
    xpEarned: attempts?.xp ?? 0,
    accuracy: attempts?.total ? Math.round((attempts.correct / attempts.total) * 100) : null,
    passRate: attempts?.finished ? Math.round((attempts.passed / attempts.finished) * 100) : null,
    newUsers,
  };
}

/** Série diária do período (dias sem movimento entram com zero). */
async function readDailySeries(from, dayKeys) {
  const day = (field) => ({ $dateToString: { format: "%Y-%m-%d", date: field, timezone: TIME_ZONE } });
  const [attemptRows, signupRows] = await Promise.all([
    AttemptModel.aggregate([
      { $match: { status: "finished", finishedAt: { $gte: from } } },
      {
        $group: {
          _id: day("$finishedAt"),
          finished: { $sum: 1 },
          users: { $addToSet: "$user" },
          xp: { $sum: { $ifNull: ["$result.xpEarned", 0] } },
          correct: { $sum: { $ifNull: ["$result.correctAnswers", 0] } },
          total: { $sum: { $ifNull: ["$result.totalQuestions", 0] } },
        },
      },
    ]),
    UserModel.aggregate([{ $match: { createdAt: { $gte: from } } }, { $group: { _id: day("$createdAt"), count: { $sum: 1 } } }]),
  ]);
  const attemptsByDay = new Map(attemptRows.map((row) => [row._id, row]));
  const signupsByDay = new Map(signupRows.map((row) => [row._id, row.count]));
  return dayKeys.map((key) => {
    const row = attemptsByDay.get(key);
    return {
      day: key,
      finishedAttempts: row?.finished ?? 0,
      activeUsers: row?.users.length ?? 0,
      xpEarned: row?.xp ?? 0,
      accuracy: row?.total ? Math.round((row.correct / row.total) * 100) : null,
      newUsers: signupsByDay.get(key) ?? 0,
    };
  });
}

/** Desempenho por atividade no período: tentativas, nota média e quantos passaram. */
async function readActivityPerformance(from, activities, modulesById) {
  const rows = await AttemptModel.aggregate([
    { $match: { status: "finished", finishedAt: { $gte: from } } },
    {
      $group: {
        _id: "$activity",
        attempts: { $sum: 1 },
        users: { $addToSet: "$user" },
        averageScore: { $avg: "$result.score" },
        passed: { $sum: { $cond: ["$result.passed", 1, 0] } },
      },
    },
  ]);
  const activitiesById = new Map(activities.map((activity) => [String(activity._id), activity]));
  return rows
    .map((row) => {
      const activity = activitiesById.get(String(row._id));
      if (!activity) return null;
      return {
        id: String(row._id),
        title: activity.title,
        module: modulesById.get(String(activity.module))?.title ?? "",
        attempts: row.attempts,
        users: row.users.length,
        averageScore: Math.round(row.averageScore ?? 0),
        passRate: Math.round((row.passed / row.attempts) * 100),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.attempts - a.attempts);
}

/** Perguntas com menor taxa de acerto no período (com um mínimo de respostas). */
async function readHardestQuestions(from, activities) {
  const rows = await AttemptModel.aggregate([
    { $match: { status: "finished", finishedAt: { $gte: from } } },
    { $unwind: "$answers" },
    { $match: { "answers.skipped": { $ne: true } } },
    {
      $group: {
        _id: { activity: "$activity", key: "$answers.questionKey" },
        answers: { $sum: 1 },
        correct: { $sum: { $cond: ["$answers.correct", 1, 0] } },
      },
    },
    { $match: { answers: { $gte: MIN_ANSWERS_FOR_DIFFICULTY } } },
    { $addFields: { rate: { $divide: ["$correct", "$answers"] } } },
    { $sort: { rate: 1, answers: -1 } },
    { $limit: 8 },
  ]);
  const activitiesById = new Map(activities.map((activity) => [String(activity._id), activity]));
  return rows
    .map((row) => {
      const activity = activitiesById.get(String(row._id.activity));
      const question = activity?.questions.find((item) => item.key === row._id.key);
      if (!question) return null;
      const answer = question.type === "camera_sign" ? question.target : question.options.find((option) => option.id === question.correctOptionId)?.text;
      return {
        activity: activity.title,
        prompt: question.prompt,
        answer: answer ?? "",
        type: question.type,
        answers: row.answers,
        accuracy: Math.round(row.rate * 100),
      };
    })
    .filter(Boolean);
}

/**
 * Funil da trilha: quantas pessoas concluíram ao menos uma atividade de cada módulo e quantas concluíram o módulo
 * inteiro (todas as atividades ativas). Considera o progresso de todos os tempos, não só o período.
 */
async function readModuleFunnel(modules, activities, totalUsers) {
  const activityIdsByModule = new Map(modules.map((module) => [String(module._id), []]));
  activities.forEach((activity) => activityIdsByModule.get(String(activity.module))?.push(activity._id));
  return Promise.all(
    modules.map(async (module) => {
      const ids = activityIdsByModule.get(String(module._id)) ?? [];
      if (ids.length === 0) return { id: String(module._id), title: module.title, activities: 0, started: 0, completed: 0, totalUsers };
      const [started, completed] = await Promise.all([
        UserModel.countDocuments({ "completedActivities.activity": { $in: ids } }),
        UserModel.countDocuments({ "completedActivities.activity": { $all: ids } }),
      ]);
      return { id: String(module._id), title: module.title, activities: ids.length, started, completed, totalUsers };
    }),
  );
}

/**
 * Tudo o que o dashboard do painel mostra para um período (7, 30 ou 90 dias): indicadores com comparação ao
 * período anterior, série diária, desempenho por atividade, perguntas mais difíceis, funil da trilha e o que
 * aconteceu por último (cadastros e alterações no painel).
 * @param {{days?: number, now?: Date}} [options]
 * @returns {Promise<object>}
 * Usado por: GET /admin/api/v1/analytics?days=.
 */
export async function readAnalytics({ days = 30, now = new Date() } = {}) {
  const period = ANALYTICS_PERIODS.includes(days) ? days : 30;
  const dayKeys = listDayKeys(period, now);
  // Começo do primeiro dia do período (meia-noite de Brasília, UTC-3), para a série e os totais baterem.
  const from = new Date(`${dayKeys[0]}T00:00:00-03:00`);
  const previousFrom = new Date(from.getTime() - period * DAY_MS);

  const [modules, activities, totalUsers, blockedUsers] = await Promise.all([
    ModuleModel.find(NOT_DEACTIVATED).sort({ order: 1 }).lean(),
    ActivityModel.find(NOT_DEACTIVATED).select("module title questions").lean(),
    UserModel.countDocuments(),
    UserModel.countDocuments({ status: "blocked", $or: [{ "ban.until": null }, { "ban.until": { $gt: new Date() } }] }),
  ]);
  const modulesById = new Map(modules.map((module) => [String(module._id), module]));

  const [current, previous, series, activityPerformance, hardestQuestions, funnel, recentUsers, recentChanges] = await Promise.all([
    readPeriodTotals(from, now),
    readPeriodTotals(previousFrom, from),
    readDailySeries(from, dayKeys),
    readActivityPerformance(from, activities, modulesById),
    readHardestQuestions(from, activities),
    readModuleFunnel(modules, activities, totalUsers),
    UserModel.find().sort({ createdAt: -1 }).limit(6).select("nickname publicId createdAt").lean(),
    AuditLogModel.find().sort({ createdAt: -1 }).limit(8).select("adminEmail action entity summary createdAt").lean(),
  ]);

  const kpi = (field) => ({ value: current[field], previous: previous[field], change: changeBetween(current[field] ?? 0, previous[field] ?? 0) });
  return {
    days: period,
    kpis: {
      activeUsers: kpi("activeUsers"),
      newUsers: kpi("newUsers"),
      finishedAttempts: kpi("finishedAttempts"),
      accuracy: kpi("accuracy"),
      xpEarned: kpi("xpEarned"),
      passRate: kpi("passRate"),
    },
    totals: { users: totalUsers, blockedUsers },
    series,
    activityPerformance,
    hardestQuestions,
    funnel,
    recentUsers: recentUsers.map((user) => ({ nickname: user.nickname, publicId: user.publicId, createdAt: user.createdAt })),
    recentChanges: recentChanges.map((log) => ({ adminEmail: log.adminEmail, action: log.action, entity: log.entity, summary: log.summary, createdAt: log.createdAt })),
  };
}
