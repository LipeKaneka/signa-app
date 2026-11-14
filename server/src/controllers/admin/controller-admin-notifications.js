import * as NotificationService from "../../services/service-notification.js";
import { readActor } from "../../middlewares/admin-auth-middleware.js";
import { NOTIFICATION_LIMITS, NOTIFICATION_TYPE_KEYS } from "../../config/notification-types.js";
import { badRequest } from "../../utils/util-http-error.js";

/** Texto opcional com limite; undefined = não mudar. */
function readText(value, label, max) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw badRequest(`${label} deve ser texto.`);
  const text = value.trim();
  if (text.length > max) throw badRequest(`${label}: no máximo ${max} caracteres.`);
  return text;
}

function readFlag(value, label) {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw badRequest(`${label} deve ser true ou false.`);
  return value;
}

/** GET /admin/api/v1/notifications/types — {types}. */
export async function listTypes(_req, res) {
  res.json(await NotificationService.listNotificationTypes());
}

/** PUT /admin/api/v1/notifications/types/:type — {enabled?, title?, body?} → {type}. */
export async function updateType(req, res) {
  const body = req.body ?? {};
  const changes = Object.fromEntries(Object.entries({
    enabled: readFlag(body.enabled, "Ligado"),
    title: readText(body.title, "Título", NOTIFICATION_LIMITS.title),
    body: readText(body.body, "Texto", NOTIFICATION_LIMITS.body),
  }).filter(([, value]) => value !== undefined));
  if (Object.keys(changes).length === 0) throw badRequest("Nada para mudar.");
  res.json({ type: await NotificationService.updateNotificationType(readActor(req), req.params.type, changes) });
}

/** DELETE /admin/api/v1/notifications/types/:type — volta ao padrão → {type}. */
export async function resetType(req, res) {
  res.json({ type: await NotificationService.resetNotificationType(readActor(req), req.params.type) });
}

/** POST /admin/api/v1/notifications/send — {title, body, userId?} (sem userId = todos) → {batch, recipients}. */
export async function send(req, res) {
  const body = req.body ?? {};
  const title = readText(body.title, "Título", NOTIFICATION_LIMITS.title);
  const text = readText(body.body, "Texto", NOTIFICATION_LIMITS.body) ?? "";
  if (!title) throw badRequest("Escreva o título do aviso.");
  const userId = body.userId === undefined || body.userId === null || body.userId === "" ? null : String(body.userId);
  res.status(201).json(await NotificationService.sendManualNotification(readActor(req), { title, body: text, userId }));
}

/** GET /admin/api/v1/notifications/history?type=&page=&limit= — {items, total, page, limit}. */
export async function history(req, res) {
  const type = typeof req.query.type === "string" && NOTIFICATION_TYPE_KEYS.includes(req.query.type) ? req.query.type : undefined;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 30));
  res.json(await NotificationService.listNotificationHistory({ type, page, limit }));
}
