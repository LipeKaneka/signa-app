import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { NotificationModel } from "../models/model-notification.js";
import { NotificationTypeModel } from "../models/model-notification-type.js";
import { UserModel } from "../models/model-user.js";
import { NOTIFICATION_TYPES, NOTIFICATION_LIMITS, findNotificationType, fillTemplate } from "../config/notification-types.js";
import { badRequest, notFound } from "../utils/util-http-error.js";
import { recordAudit } from "./service-audit.js";
import { sendPush, isPushConfigured } from "./service-push.js";

/** Quantas notificações o app recebe por página e quantos aparelhos cada pessoa registra. */
const LIST_LIMIT = 50;
const MAX_PUSH_TOKENS = 5;
/** Aviso para todos: grava em blocos para não pesar no banco. */
const INSERT_CHUNK = 500;

/**
 * Notificações novas, em tempo real: "notification" com {userId, notification}. O backend escuta isso pelo
 * GET /internal/v1/notifications/stream e repassa para o app de cada pessoa.
 */
export const notificationHub = new EventEmitter();
notificationHub.setMaxListeners(50);

/** Formato que vai para o app. */
export function toPublicNotification(doc) {
  return {
    id: String(doc._id),
    type: doc.type,
    title: doc.title,
    body: doc.body,
    link: doc.link,
    read: Boolean(doc.readAt),
    createdAt: doc.createdAt,
  };
}

/** Configuração valendo de cada tipo (padrão + o que o painel mudou). */
async function readTypeConfigs() {
  const saved = new Map((await NotificationTypeModel.find().lean()).map((doc) => [doc.type, doc]));
  return new Map(NOTIFICATION_TYPES.map((item) => {
    const custom = saved.get(item.type);
    return [item.type, {
      ...item,
      enabled: custom?.enabled ?? true,
      push: custom?.push ?? true,
      title: custom?.title || item.title,
      body: custom?.body || item.body,
      customized: Boolean(custom),
      updatedAt: custom?.updatedAt ?? null,
      updatedBy: custom?.updatedBy ?? null,
    }];
  }));
}

/** Manda para o celular de cada pessoa (se o tipo permitir) e apaga tokens que não valem mais. */
async function pushToUsers(userIds, message) {
  if (!isPushConfigured() || userIds.length === 0) return;
  const users = await UserModel.find({ _id: { $in: userIds }, "pushTokens.0": { $exists: true } }).select("+pushTokens").lean();
  await Promise.all(users.map(async (user) => {
    const invalid = await sendPush(user.pushTokens.map((item) => item.token), message);
    if (invalid.length) await UserModel.updateOne({ _id: user._id }, { $pull: { pushTokens: { token: { $in: invalid } } } });
  }));
}

/**
 * Grava, avisa em tempo real e manda para o celular.
 * @param {string[]|mongoose.Types.ObjectId[]} userIds
 * @param {{type: string, title: string, body: string, link: string, batch?: string|null, sentBy?: string|null}} content
 * @param {{push: boolean}} options
 * @returns {Promise<number>} quantas foram criadas.
 */
async function deliver(userIds, content, { push }) {
  if (userIds.length === 0 || !content.title) return 0;
  const now = new Date();
  const docs = userIds.map((user) => ({ _id: new mongoose.Types.ObjectId(), user, ...content, readAt: null, createdAt: now }));
  for (let start = 0; start < docs.length; start += INSERT_CHUNK) {
    await NotificationModel.insertMany(docs.slice(start, start + INSERT_CHUNK), { ordered: false });
  }
  for (const doc of docs) notificationHub.emit("notification", { userId: String(doc.user), notification: toPublicNotification(doc) });
  if (push) {
    const id = docs.length === 1 ? String(docs[0]._id) : "";
    pushToUsers(userIds, { title: content.title, body: content.body, link: content.link, id }).catch(() => {});
  }
  return docs.length;
}

/**
 * Notificação automática para uma pessoa. Tipo desligado no painel = nada acontece. Nunca lança (uma falha aqui
 * não pode estragar o fim da atividade): só vai para o log.
 * @param {unknown} userId
 * @param {string} type - de config/notification-types.js.
 * @param {Record<string, unknown>} [values] - variáveis do texto.
 * @returns {Promise<void>}
 * Usado por: service-attempt.js, service-app-events.js, service-admin-users.js.
 */
export async function notifyUser(userId, type, values = {}) {
  try {
    const config = (await readTypeConfigs()).get(type);
    if (!config?.enabled) return;
    await deliver([userId], {
      type,
      title: fillTemplate(config.title, values).slice(0, 120),
      body: fillTemplate(config.body, values).slice(0, 400),
      link: config.link,
      batch: null,
    }, { push: config.push });
  } catch (error) {
    console.error(`Notificação "${type}" não foi criada:`, error.message);
  }
}

/**
 * Uma notificação "Conquista desbloqueada" para cada conquista nova.
 * @param {unknown} userId
 * @param {{title: string}[]} achievements
 * Usado por: service-attempt.js, service-app-events.js, service-admin-users.js.
 */
export async function notifyAchievements(userId, achievements = []) {
  for (const achievement of achievements) await notifyUser(userId, "achievement_unlocked", { achievement: achievement.title });
}

/**
 * "Subiu de nível", se o XP mudou de nível.
 * @param {unknown} userId
 * @param {{level: number}} before - describeLevel do XP antigo.
 * @param {{level: number, title: string}} after - describeLevel do XP novo.
 */
export async function notifyLevelUp(userId, before, after) {
  if (after.level > before.level) await notifyUser(userId, "level_up", { level: after.level, levelTitle: after.title });
}

/** Contas que recebem avisos para todos (ativas). */
async function listActiveUserIds() {
  return (await UserModel.find({ status: "active" }).select("_id").lean()).map((user) => user._id);
}

/**
 * Notificação automática para todos, uma vez por batch (ex.: o mesmo evento não avisa duas vezes no mesmo dia).
 * @param {string} type
 * @param {Record<string, unknown>} values
 * @param {string} batch - chave única do envio.
 * @returns {Promise<number>} quantas pessoas receberam (0 se já foi enviado ou o tipo está desligado).
 * Usado por: service-notification-scheduler.js (eventos) e service-admin-gamification.js (versão nova).
 */
export async function notifyAll(type, values, batch) {
  try {
    const config = (await readTypeConfigs()).get(type);
    if (!config?.enabled || (await NotificationModel.exists({ batch }))) return 0;
    return await deliver(await listActiveUserIds(), {
      type,
      title: fillTemplate(config.title, values).slice(0, 120),
      body: fillTemplate(config.body, values).slice(0, 400),
      link: config.link,
      batch,
    }, { push: config.push });
  } catch (error) {
    console.error(`Aviso para todos "${type}" não foi criado:`, error.message);
    return 0;
  }
}

/* ----------------------------------------------------------------------------------------- app (via backend) */

/**
 * Últimas notificações da pessoa e quantas não foram lidas.
 * @param {object} user
 * @returns {Promise<{notifications: object[], unread: number}>}
 * Usado por: GET /internal/v1/users/:userId/notifications.
 */
export async function listUserNotifications(user) {
  const [docs, unread] = await Promise.all([
    NotificationModel.find({ user: user._id }).sort({ createdAt: -1 }).limit(LIST_LIMIT).lean(),
    NotificationModel.countDocuments({ user: user._id, readAt: null }),
  ]);
  return { notifications: docs.map(toPublicNotification), unread };
}

/**
 * Marca como lidas (todas, ou só as dos ids).
 * @param {object} user
 * @param {string[]|"all"} ids
 * @returns {Promise<{unread: number}>}
 * Usado por: POST /internal/v1/users/:userId/notifications/read.
 */
export async function markNotificationsRead(user, ids) {
  const filter = { user: user._id, readAt: null };
  if (ids !== "all") filter._id = { $in: ids.filter((id) => mongoose.isValidObjectId(id)) };
  await NotificationModel.updateMany(filter, { readAt: new Date() });
  return { unread: await NotificationModel.countDocuments({ user: user._id, readAt: null }) };
}

/**
 * Registra (ou tira) o aparelho que recebe notificação no celular.
 * @param {object} user
 * @param {string} token - token do Firebase; vazio tira.
 * @param {string} [previous] - token antigo do aparelho, para tirar junto.
 * @returns {Promise<{push: boolean}>} push = servidor configurado para mandar ao celular.
 * Usado por: PUT/DELETE /internal/v1/users/:userId/push-token.
 */
export async function savePushToken(user, token, previous = "") {
  const remove = [token, previous].filter(Boolean);
  if (remove.length) await UserModel.updateOne({ _id: user._id }, { $pull: { pushTokens: { token: { $in: remove } } } });
  if (token) {
    // Um aparelho é de uma pessoa só: quem entrar em outra conta no mesmo celular leva o token junto.
    await UserModel.updateMany({ _id: { $ne: user._id } }, { $pull: { pushTokens: { token } } });
    await UserModel.updateOne(
      { _id: user._id },
      { $push: { pushTokens: { $each: [{ token, updatedAt: new Date() }], $slice: -MAX_PUSH_TOKENS } } },
    );
  }
  return { push: isPushConfigured() };
}

/* ----------------------------------------------------------------------------------------- painel */

/**
 * Todos os tipos com a configuração valendo.
 * @returns {Promise<{types: object[], pushConfigured: boolean, pushDevices: number}>} pushDevices = pessoas com celular registrado.
 * Usado por: GET /admin/api/v1/notifications/types.
 */
export async function listNotificationTypes() {
  const [configs, pushDevices] = await Promise.all([readTypeConfigs(), UserModel.countDocuments({ "pushTokens.0": { $exists: true } })]);
  return { types: [...configs.values()], pushConfigured: isPushConfigured(), pushDevices };
}

/**
 * Muda um tipo (ligar/desligar, push, título, texto). Título/texto vazio = volta ao padrão.
 * @param {object} actor
 * @param {string} type
 * @param {{enabled?: boolean, push?: boolean, title?: string, body?: string}} changes - já validados.
 * @returns {Promise<object>} o tipo atualizado.
 * Usado por: PUT /admin/api/v1/notifications/types/:type.
 */
export async function updateNotificationType(actor, type, changes) {
  const definition = findNotificationType(type);
  if (!definition) throw notFound("Tipo de notificação não encontrado.");
  if (definition.manual && (changes.title !== undefined || changes.body !== undefined)) {
    throw badRequest("O aviso do painel é escrito na hora do envio: não tem texto padrão.");
  }
  const before = (await readTypeConfigs()).get(type);
  await NotificationTypeModel.findOneAndUpdate(
    { type },
    { $set: { ...changes, updatedBy: actor.admin.email } },
    { upsert: true, setDefaultsOnInsert: true },
  );
  const after = (await readTypeConfigs()).get(type);
  await recordAudit(actor, {
    action: "update",
    entity: "notification-type",
    entityId: type,
    summary: `notificação "${definition.label}" alterada`,
    before: { enabled: before.enabled, push: before.push, title: before.title, body: before.body },
    after: { enabled: after.enabled, push: after.push, title: after.title, body: after.body },
  });
  return after;
}

/**
 * Volta um tipo ao padrão do código.
 * Usado por: DELETE /admin/api/v1/notifications/types/:type.
 */
export async function resetNotificationType(actor, type) {
  const definition = findNotificationType(type);
  if (!definition) throw notFound("Tipo de notificação não encontrado.");
  await NotificationTypeModel.deleteOne({ type });
  await recordAudit(actor, { action: "update", entity: "notification-type", entityId: type, summary: `notificação "${definition.label}" voltou ao padrão` });
  return (await readTypeConfigs()).get(type);
}

/**
 * Envia um aviso escrito no painel, agora, para todos ou para uma pessoa.
 * @param {object} actor
 * @param {{title: string, body: string, userId?: string|null}} message - já validados (limites de NOTIFICATION_LIMITS).
 * @returns {Promise<{batch: string, recipients: number}>}
 * @throws {HttpError} 404 pessoa não encontrada; 400 aviso desligado.
 * Usado por: POST /admin/api/v1/notifications/send.
 */
export async function sendManualNotification(actor, { title, body, userId = null }) {
  const config = (await readTypeConfigs()).get("manual");
  if (!config.enabled) throw badRequest("O tipo \"Aviso do painel\" está desligado. Ligue-o para enviar.");
  let recipients;
  let target = "todos";
  if (userId) {
    const user = mongoose.isValidObjectId(userId) ? await UserModel.findById(userId).select("nickname").lean() : null;
    if (!user) throw notFound("Usuário não encontrado.");
    recipients = [user._id];
    target = user.nickname;
  } else {
    recipients = await listActiveUserIds();
  }
  const batch = `manual:${randomUUID()}`;
  const count = await deliver(recipients, { type: "manual", title, body, link: config.link, batch, sentBy: actor.admin.email }, { push: config.push });
  await recordAudit(actor, { action: "create", entity: "notification", entityId: batch, summary: `aviso "${title}" enviado para ${target} (${count})` });
  return { batch, recipients: count };
}

/**
 * Histórico: um item por envio (aviso para todos = um item), do mais novo ao mais antigo, com quantas pessoas
 * receberam e quantas leram.
 * @param {{type?: string, page?: number, limit?: number}} query
 * @returns {Promise<{items: object[], total: number, page: number, limit: number}>}
 * Usado por: GET /admin/api/v1/notifications/history.
 */
export async function listNotificationHistory({ type, page = 1, limit = 30 } = {}) {
  const match = type ? { type } : {};
  const [result] = await NotificationModel.aggregate([
    { $match: match },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: { $ifNull: ["$batch", { $toString: "$_id" }] },
        type: { $first: "$type" },
        title: { $first: "$title" },
        body: { $first: "$body" },
        sentBy: { $first: "$sentBy" },
        user: { $first: "$user" },
        isBatch: { $first: { $ne: ["$batch", null] } },
        createdAt: { $max: "$createdAt" },
        recipients: { $sum: 1 },
        read: { $sum: { $cond: [{ $ne: ["$readAt", null] }, 1, 0] } },
      },
    },
    { $sort: { createdAt: -1 } },
    { $facet: { items: [{ $skip: (page - 1) * limit }, { $limit: limit }], total: [{ $count: "count" }] } },
  ]);
  const items = result.items;
  const singleUsers = items.filter((item) => item.recipients === 1).map((item) => item.user);
  const names = new Map((await UserModel.find({ _id: { $in: singleUsers } }).select("nickname").lean()).map((u) => [String(u._id), u.nickname]));
  const labels = new Map(NOTIFICATION_TYPES.map((item) => [item.type, item.label]));
  return {
    items: items.map((item) => ({
      id: item._id,
      type: item.type,
      typeLabel: labels.get(item.type) ?? item.type,
      title: item.title,
      body: item.body,
      sentBy: item.sentBy,
      to: item.recipients === 1 ? { id: String(item.user), nickname: names.get(String(item.user)) ?? "(conta excluída)" } : null,
      recipients: item.recipients,
      read: item.read,
      createdAt: item.createdAt,
    })),
    total: result.total[0]?.count ?? 0,
    page,
    limit,
  };
}

export { NOTIFICATION_LIMITS };
