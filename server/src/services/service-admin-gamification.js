import { AchievementModel } from "../models/model-achievement.js";
import { EventModel } from "../models/model-event.js";
import { LevelModel } from "../models/model-level.js";
import { SettingModel } from "../models/model-setting.js";
import { ACHIEVEMENT_METRICS } from "../config/achievement-metrics.js";
import { SETTING_DEFINITIONS } from "../config/setting-definitions.js";
import { badRequest, conflict, notFound } from "../utils/util-http-error.js";
import { recordAudit } from "./service-audit.js";
import { publishContentChange } from "./service-admin-publish.js";
import { describeActiveChange } from "./service-admin-trail.js";
import { listLevels } from "./service-level.js";
import { setSetting } from "./service-settings.js";

/**
 * Conquista no formato do painel.
 * @param {object} achievement
 * @returns {object}
 */
function toAdminAchievement(achievement) {
  const { _id, __v, createdAt, ...fields } = achievement;
  return { id: String(_id), ...fields, active: achievement.active !== false };
}

/**
 * Todas as conquistas (ativas e desativadas) e as métricas que podem ser escolhidas.
 * @returns {Promise<{achievements: object[], metrics: {id: string, label: string}[]}>}
 * Usado por: GET /admin/api/v1/achievements.
 */
export async function listAchievements() {
  const achievements = await AchievementModel.find().sort({ order: 1, createdAt: 1 }).lean();
  return { achievements: achievements.map(toAdminAchievement), metrics: ACHIEVEMENT_METRICS };
}

/**
 * Cria uma conquista.
 * @param {object} actor
 * @param {{key, title, description, metric, goal, icon, order}} data - já validado (metric e key pelo schema).
 * @returns {Promise<object>}
 * @throws {HttpError} 409 se a chave já existir.
 * Usado por: POST /admin/api/v1/achievements.
 */
export async function createAchievement(actor, data) {
  if (await AchievementModel.exists({ key: data.key })) throw conflict(`Já existe a conquista "${data.key}".`);
  const achievement = await AchievementModel.create(data);
  await publishContentChange();
  await recordAudit(actor, { action: "create", entity: "achievement", entityId: data.key, summary: `Conquista "${data.title}"`, after: achievement });
  return toAdminAchievement(achievement.toObject());
}

/**
 * Edita uma conquista (a chave não muda: é o id que o app conhece).
 * @param {object} actor
 * @param {string} achievementId
 * @param {object} changes - já validado.
 * @returns {Promise<object>}
 * Usado por: PATCH /admin/api/v1/achievements/:id.
 */
export async function updateAchievement(actor, achievementId, changes) {
  const achievement = await AchievementModel.findById(achievementId);
  if (!achievement) throw notFound("Conquista não encontrada.");
  const before = achievement.toObject();
  for (const field of ["title", "description", "metric", "goal", "icon", "order", "active"]) {
    if (changes[field] !== undefined) achievement[field] = changes[field];
  }
  await achievement.save();
  await publishContentChange();
  await recordAudit(actor, {
    action: describeActiveChange(before.active !== false, changes.active),
    entity: "achievement",
    entityId: achievement.key,
    summary: `Conquista "${achievement.title}"`,
    before,
    after: achievement,
  });
  return toAdminAchievement(achievement.toObject());
}

/**
 * Exclusão definitiva de uma conquista desativada.
 * @param {object} actor
 * @param {string} achievementId
 * @returns {Promise<void>}
 * Usado por: DELETE /admin/api/v1/achievements/:id (papel admin).
 */
export async function deleteAchievement(actor, achievementId) {
  const achievement = await AchievementModel.findById(achievementId);
  if (!achievement) throw notFound("Conquista não encontrada.");
  if (achievement.active !== false) throw badRequest("Desative a conquista antes de excluir.");
  await achievement.deleteOne();
  await publishContentChange();
  await recordAudit(actor, { action: "delete", entity: "achievement", entityId: achievement.key, summary: `Conquista "${achievement.title}"`, before: achievement });
}

/**
 * Evento no formato do painel, com a situação calculada agora.
 * @param {object} event
 * @param {Date} [now]
 * @returns {object}
 */
function toAdminEvent(event, now = new Date()) {
  const { _id, __v, ...fields } = event;
  let state = "scheduled";
  if (event.active === false) state = "inactive";
  else if (new Date(event.endsAt) <= now) state = "ended";
  else if (new Date(event.startsAt) <= now) state = "running";
  return { id: String(_id), ...fields, state };
}

/**
 * Todos os eventos, do que começa mais tarde para o mais antigo.
 * @returns {Promise<object[]>}
 * Usado por: GET /admin/api/v1/events.
 */
export async function listEvents() {
  const events = await EventModel.find().sort({ startsAt: -1 }).lean();
  return events.map((event) => toAdminEvent(event));
}

/**
 * Cria um evento (ex.: 2x XP de sexta a domingo).
 * @param {object} actor
 * @param {{title, description, type, multiplier, startsAt, endsAt}} data - já validado.
 * @returns {Promise<object>}
 * Usado por: POST /admin/api/v1/events.
 */
export async function createEvent(actor, data) {
  if (data.endsAt <= data.startsAt) throw badRequest("O fim do evento precisa ser depois do início.");
  const event = await EventModel.create(data);
  await publishContentChange();
  await recordAudit(actor, { action: "create", entity: "event", entityId: event._id, summary: `Evento "${data.title}" (${data.multiplier}x)`, after: event });
  return toAdminEvent(event.toObject());
}

/**
 * Edita um evento.
 * @param {object} actor
 * @param {string} eventId
 * @param {object} changes - já validado.
 * @returns {Promise<object>}
 * Usado por: PATCH /admin/api/v1/events/:id e POST /events/:id/end (endsAt = agora).
 */
export async function updateEvent(actor, eventId, changes) {
  const event = await EventModel.findById(eventId);
  if (!event) throw notFound("Evento não encontrado.");
  const before = event.toObject();
  for (const field of ["title", "description", "multiplier", "startsAt", "endsAt", "active"]) {
    if (changes[field] !== undefined) event[field] = changes[field];
  }
  if (event.endsAt <= event.startsAt) throw badRequest("O fim do evento precisa ser depois do início.");
  await event.save();
  await publishContentChange();
  await recordAudit(actor, {
    action: changes.endNow ? "end" : describeActiveChange(before.active !== false, changes.active),
    entity: "event",
    entityId: event._id,
    summary: `Evento "${event.title}"`,
    before,
    after: event,
  });
  return toAdminEvent(event.toObject());
}

/**
 * Encerra agora um evento em andamento.
 * @param {object} actor
 * @param {string} eventId
 * @returns {Promise<object>}
 * @throws {HttpError} 400 se o evento ainda não começou ou já acabou.
 */
export async function endEventNow(actor, eventId) {
  const event = await EventModel.findById(eventId).lean();
  if (!event) throw notFound("Evento não encontrado.");
  const now = new Date();
  if (event.startsAt > now || event.endsAt <= now) throw badRequest("Só dá para encerrar um evento em andamento.");
  return updateEvent(actor, eventId, { endsAt: now, endNow: true });
}

/**
 * Exclusão definitiva de um evento desativado ou já encerrado.
 * @param {object} actor
 * @param {string} eventId
 * @returns {Promise<void>}
 * Usado por: DELETE /admin/api/v1/events/:id (papel admin).
 */
export async function deleteEvent(actor, eventId) {
  const event = await EventModel.findById(eventId);
  if (!event) throw notFound("Evento não encontrado.");
  if (event.active !== false && event.endsAt > new Date()) throw badRequest("Desative ou encerre o evento antes de excluir.");
  await event.deleteOne();
  await publishContentChange();
  await recordAudit(actor, { action: "delete", entity: "event", entityId: eventId, summary: `Evento "${event.title}"`, before: event });
}

/**
 * Valida a tabela de níveis inteira: números 1..N em sequência, nível 1 com 0 XP e XP sempre crescente.
 * @param {unknown} levels
 * @returns {{level: number, minXp: number, title: string}[]}
 * @throws {HttpError} 400.
 */
export function readLevelTable(levels) {
  if (!Array.isArray(levels) || levels.length === 0 || levels.length > 100) throw badRequest("Envie de 1 a 100 níveis.");
  return levels.map((entry, index) => {
    const title = typeof entry?.title === "string" ? entry.title.trim() : "";
    if (!title || title.length > 60) throw badRequest(`Nível ${index + 1}: nome de 1 a 60 caracteres.`);
    if (!Number.isInteger(entry.minXp) || entry.minXp < 0 || entry.minXp > 10_000_000) {
      throw badRequest(`Nível ${index + 1}: XP mínimo inválido.`);
    }
    if (index === 0 && entry.minXp !== 0) throw badRequest("O nível 1 precisa começar em 0 XP.");
    if (index > 0 && entry.minXp <= levels[index - 1].minXp) throw badRequest(`Nível ${index + 1}: o XP mínimo precisa ser maior que o do nível anterior.`);
    return { level: index + 1, minXp: entry.minXp, title };
  });
}

/**
 * Substitui a tabela de níveis (o nível de cada usuário é recalculado pelo XP, nada é gravado nos usuários).
 * @param {object} actor
 * @param {{level: number, minXp: number, title: string}[]} levels - de readLevelTable.
 * @returns {Promise<object[]>}
 * Usado por: PUT /admin/api/v1/levels.
 */
export async function replaceLevels(actor, levels) {
  const before = await listLevels();
  await LevelModel.deleteMany({});
  await LevelModel.insertMany(levels);
  await publishContentChange();
  await recordAudit(actor, { action: "update", entity: "level", summary: `Tabela de níveis (${levels.length} níveis)`, before, after: levels });
  return listLevels();
}

/**
 * Configurações com definição (rótulo, limites, padrão), valor atual e se foi alterada.
 * @returns {Promise<object[]>}
 * Usado por: GET /admin/api/v1/settings.
 */
export async function listSettings() {
  const stored = await SettingModel.find({ key: { $in: SETTING_DEFINITIONS.map((definition) => definition.key) } }).lean();
  const byKey = new Map(stored.map((setting) => [setting.key, setting]));
  return SETTING_DEFINITIONS.map((definition) => {
    const saved = byKey.get(definition.key);
    return {
      ...definition,
      value: saved ? saved.value : definition.default,
      customized: Boolean(saved),
      updatedAt: saved?.updatedAt ?? null,
    };
  });
}

/**
 * Salva uma configuração (validada por setSetting) e registra quem mudou.
 * @param {object} actor
 * @param {string} key
 * @param {unknown} value
 * @returns {Promise<unknown>} valor salvo.
 * Usado por: PUT /admin/api/v1/settings/:key.
 */
export async function updateSetting(actor, key, value) {
  const before = await SettingModel.findOne({ key }).lean();
  const saved = await setSetting(key, value, actor.admin.email);
  await publishContentChange();
  await recordAudit(actor, { action: "update", entity: "setting", entityId: key, summary: `Configuração ${key}`, before: before?.value ?? null, after: saved });
  return saved;
}

/**
 * Volta uma configuração ao padrão do código (apaga o valor salvo).
 * @param {object} actor
 * @param {string} key
 * @returns {Promise<void>}
 * Usado por: DELETE /admin/api/v1/settings/:key.
 */
export async function resetSetting(actor, key) {
  if (!SETTING_DEFINITIONS.some((definition) => definition.key === key)) throw badRequest(`Configuração desconhecida: ${key}.`);
  const before = await SettingModel.findOneAndDelete({ key }).lean();
  await publishContentChange();
  await recordAudit(actor, { action: "reset", entity: "setting", entityId: key, summary: `Configuração ${key} voltou ao padrão`, before: before?.value ?? null });
}
