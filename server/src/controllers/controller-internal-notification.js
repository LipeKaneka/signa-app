import * as NotificationService from "../services/service-notification.js";
import { badRequest } from "../utils/util-http-error.js";

/** Intervalo do "estou vivo" no fluxo (proxies do Render fecham conexões paradas). */
const HEARTBEAT_MS = 25 * 1000;

/**
 * GET /internal/v1/notifications/stream — fluxo (Server-Sent Events) com TODAS as notificações novas, para o
 * backend repassar ao app de cada pessoa. Cada mensagem: event "notification", data {userId, notification}.
 */
export function streamNotifications(req, res) {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  res.write(": conectado\n\n");
  const send = (payload) => res.write(`event: notification\ndata: ${JSON.stringify(payload)}\n\n`);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
  NotificationService.notificationHub.on("notification", send);
  req.on("close", () => {
    clearInterval(heartbeat);
    NotificationService.notificationHub.off("notification", send);
  });
}

/** GET /internal/v1/users/:userId/notifications — {notifications, unread}. */
export async function list(req, res) {
  res.json(await NotificationService.listUserNotifications(req.user));
}

/** POST /internal/v1/users/:userId/notifications/read — {ids: [...]} ou {all: true} → {unread}. */
export async function markRead(req, res) {
  const body = req.body ?? {};
  if (body.all === true) {
    res.json(await NotificationService.markNotificationsRead(req.user, "all"));
    return;
  }
  if (!Array.isArray(body.ids) || body.ids.length === 0 || body.ids.length > 100 || body.ids.some((id) => typeof id !== "string")) {
    throw badRequest("Envie ids (lista de até 100) ou all: true.");
  }
  res.json(await NotificationService.markNotificationsRead(req.user, body.ids));
}
