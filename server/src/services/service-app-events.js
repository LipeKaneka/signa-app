import { UserModel } from "../models/model-user.js";
import { notifyAchievements } from "./service-notification.js";
import { SignModel } from "../models/model-sign.js";
import { APP_EVENT_METRICS, SIGN_VIEW_EVENT } from "../config/achievement-metrics.js";
import { badRequest } from "../utils/util-http-error.js";
import {
  findNewlyUnlocked,
  listAchievementsWithProgress,
  readAchievementOverrides,
  readUserAchievementMetrics,
  recordUnlockDates,
} from "./service-achievement.js";

/** Limites de cada envio (o app junta os toques e manda de tempos em tempos). */
export const APP_EVENT_LIMITS = Object.freeze({ maxEvents: 30, maxCountPerEvent: 50 });
const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;

/**
 * Lê e valida os eventos enviados pelo app. Tipos desconhecidos são ignorados (app mais novo que o servidor).
 * @param {unknown} events
 * @returns {{counts: Map<string, number>, signs: Set<string>}}
 * @throws {HttpError} 400 se o formato estiver errado.
 */
export function readAppEvents(events) {
  if (!Array.isArray(events) || events.length === 0 || events.length > APP_EVENT_LIMITS.maxEvents) {
    throw badRequest(`Envie de 1 a ${APP_EVENT_LIMITS.maxEvents} eventos.`);
  }
  const counts = new Map();
  const signs = new Set();
  for (const event of events) {
    if (!event || typeof event.type !== "string") throw badRequest("Evento inválido.");
    if (event.type === SIGN_VIEW_EVENT) {
      if (typeof event.sign !== "string" || !SLUG_PATTERN.test(event.sign)) throw badRequest("Sinal inválido.");
      signs.add(event.sign);
    } else if (APP_EVENT_METRICS[event.type]) {
      const count = event.count ?? 1;
      if (!Number.isInteger(count) || count < 1 || count > APP_EVENT_LIMITS.maxCountPerEvent) {
        throw badRequest(`Quantidade inválida (1 a ${APP_EVENT_LIMITS.maxCountPerEvent}).`);
      }
      counts.set(event.type, Math.min((counts.get(event.type) ?? 0) + count, APP_EVENT_LIMITS.maxCountPerEvent));
    }
  }
  return { counts, signs };
}

/**
 * Soma as ações do app (toques, perguntas ao assistente...) e os sinais abertos no dicionário, e devolve as
 * conquistas que a pessoa acabou de desbloquear (com a data registrada).
 * A soma é atômica ($inc / $addToSet): dois envios ao mesmo tempo não se perdem. Sinais que não existem são ignorados.
 * @param {object} user - documento do usuário (os campos em memória também são atualizados).
 * @param {unknown} events - [{type, count?}] ou [{type: "sign_view", sign: "<slug>"}].
 * @returns {Promise<{newAchievements: {id: string, title: string}[]}>}
 * Usado por: POST /internal/v1/users/:userId/events.
 */
export async function recordAppEvents(user, events) {
  const { counts, signs } = readAppEvents(events);
  const existingSigns = signs.size > 0
    ? await SignModel.distinct("slug", { slug: { $in: [...signs] }, active: { $ne: false } })
    : [];
  if (counts.size === 0 && existingSigns.length === 0) return { newAchievements: [] };

  const metricsBefore = await readUserAchievementMetrics(user);
  const update = {};
  if (counts.size > 0) update.$inc = Object.fromEntries([...counts].map(([type, count]) => [`actionCounts.${type}`, count]));
  if (existingSigns.length > 0) update.$addToSet = { viewedSigns: { $each: existingSigns } };
  const updated = await UserModel.findOneAndUpdate({ _id: user._id }, update, { returnDocument: "after" })
    .select("actionCounts viewedSigns")
    .lean();
  user.actionCounts = new Map(Object.entries(updated.actionCounts ?? {}));
  user.viewedSigns = updated.viewedSigns ?? [];

  const metricsAfter = await readUserAchievementMetrics(user);
  const overrides = readAchievementOverrides(user);
  const newAchievements = await findNewlyUnlocked(metricsBefore, metricsAfter, overrides);
  if (newAchievements.length > 0 && recordUnlockDates(user, await listAchievementsWithProgress(metricsAfter, overrides))) {
    await UserModel.updateOne({ _id: user._id }, { $set: { achievementUnlocks: user.achievementUnlocks } });
  }
  notifyAchievements(user._id, newAchievements).catch(() => {});
  return { newAchievements };
}
