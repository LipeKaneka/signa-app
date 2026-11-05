import { UserModel } from "../models/model-user.js";
import { AttemptModel } from "../models/model-attempt.js";
import { ModuleModel } from "../models/model-module.js";
import { ActivityModel } from "../models/model-activity.js";
import { SignModel } from "../models/model-sign.js";
import { AchievementModel } from "../models/model-achievement.js";
import { EventModel } from "../models/model-event.js";
import { LevelModel } from "../models/model-level.js";
import { SettingModel } from "../models/model-setting.js";
import { toDayKey } from "./service-streak.js";
import { getContentVersion } from "./service-content-version.js";
import { recordAudit } from "./service-audit.js";
import { findActiveEvents } from "./service-event.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOT_DEACTIVATED = Object.freeze({ active: { $ne: false } });

/**
 * Números da tela inicial do painel.
 * @param {Date} [now]
 * @returns {Promise<object>}
 * Usado por: GET /admin/api/v1/stats.
 */
export async function readStats(now = new Date()) {
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const weekAgoKey = toDayKey(weekAgo);
  const [
    users, blockedUsers, newUsers, studiedThisWeek, finishedAttempts,
    modules, activities, signs, unreviewedSigns, achievements, activeEvents, contentVersion,
  ] = await Promise.all([
    UserModel.countDocuments(),
    UserModel.countDocuments({ status: "blocked", $or: [{ "ban.until": null }, { "ban.until": { $gt: new Date() } }] }),
    UserModel.countDocuments({ createdAt: { $gte: weekAgo } }),
    UserModel.countDocuments({ lastActivityDay: { $gte: weekAgoKey } }),
    AttemptModel.countDocuments({ status: "finished", finishedAt: { $gte: weekAgo } }),
    ModuleModel.countDocuments(NOT_DEACTIVATED),
    ActivityModel.countDocuments(NOT_DEACTIVATED),
    SignModel.countDocuments(NOT_DEACTIVATED),
    SignModel.countDocuments({ ...NOT_DEACTIVATED, glossReviewed: { $ne: true } }),
    AchievementModel.countDocuments(NOT_DEACTIVATED),
    findActiveEvents(now),
    getContentVersion(),
  ]);
  return {
    users: { total: users, blocked: blockedUsers, newThisWeek: newUsers, studiedThisWeek },
    activity: { finishedAttemptsThisWeek: finishedAttempts },
    content: { modules, activities, signs, unreviewedSigns, achievements },
    activeEvents,
    contentVersion,
  };
}

/** Tira _id/__v e transforma em JSON puro (para exportar). */
const clean = (documents) => JSON.parse(JSON.stringify(documents)).map(({ __v, ...rest }) => rest);

/**
 * Exporta todo o conteúdo (sem usuários, tentativas, administradores nem auditoria) em JSON.
 * Serve de cópia de segurança do conteúdo e para levar conteúdo de um ambiente a outro.
 * @param {object} actor
 * @returns {Promise<object>}
 * Usado por: GET /admin/api/v1/database/export (papel admin).
 */
export async function exportContent(actor) {
  const [signs, modules, activities, achievements, events, levels, settings, contentVersion] = await Promise.all([
    SignModel.find().lean(),
    ModuleModel.find().sort({ order: 1 }).lean(),
    ActivityModel.find().sort({ module: 1, order: 1 }).lean(),
    AchievementModel.find().sort({ order: 1 }).lean(),
    EventModel.find().lean(),
    LevelModel.find().sort({ level: 1 }).lean(),
    SettingModel.find({ key: { $ne: "content.version" } }).lean(),
    getContentVersion(),
  ]);
  await recordAudit(actor, { action: "export", entity: "database", summary: "Exportou o conteúdo" });
  return {
    format: "signa-ludus-content",
    exportedAt: new Date().toISOString(),
    contentVersion,
    signs: clean(signs),
    modules: clean(modules),
    activities: clean(activities),
    achievements: clean(achievements),
    events: clean(events),
    levels: clean(levels),
    settings: clean(settings),
  };
}
