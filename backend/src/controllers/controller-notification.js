import * as NotificationService from "../services/service-notification.js";
import { checkSession } from "../services/service-user.js";
import { badRequest } from "../utils/util-http-error.js";

/** "Estou vivo" no fluxo e conferência da conta (banida = fecha). */
const HEARTBEAT_MS = 25 * 1000;
const SESSION_CHECK_MS = 60 * 1000;

/** GET /notifications — {notifications, unread}. */
export async function list(req, res) {
  res.json(await NotificationService.listNotifications(req.userId));
}

/** POST /notifications/read — {ids} ou {all: true} → {unread}. */
export async function markRead(req, res) {
  const body = req.body ?? {};
  if (body.all === true) {
    res.json(await NotificationService.markNotificationsRead(req.userId, { all: true }));
    return;
  }
  if (!Array.isArray(body.ids) || body.ids.length === 0 || body.ids.length > 100) throw badRequest("Envie ids ou all: true.");
  res.json(await NotificationService.markNotificationsRead(req.userId, { ids: body.ids.map(String) }));
}

/**
 * GET /notifications/stream — Server-Sent Events: "notification" com cada notificação nova da pessoa, na hora.
 * O app reconecta sozinho se cair.
 */
export function stream(req, res) {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  res.write("retry: 5000\n\n");
  const unsubscribe = NotificationService.subscribe(req.userId, (notification) => {
    res.write(`event: notification\ndata: ${JSON.stringify(notification)}\n\n`);
  });
  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
  const sessionCheck = setInterval(() => {
    checkSession(req.userId).catch(() => {
      res.write("event: closed\ndata: {}\n\n");
      res.end();
    });
  }, SESSION_CHECK_MS);
  req.on("close", () => {
    clearInterval(heartbeat);
    clearInterval(sessionCheck);
    unsubscribe();
  });
}
