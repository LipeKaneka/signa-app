import * as NotificationService from "../services/service-notification.js";
import { ensureActiveSession } from "../middlewares/auth-middleware.js";
import { badRequest } from "../utils/util-http-error.js";
import { MESSAGES } from "../config/messages.js";

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
  if (!Array.isArray(body.ids) || body.ids.length === 0 || body.ids.length > 100) throw badRequest(MESSAGES.validation.notificationIds);
  res.json(await NotificationService.markNotificationsRead(req.userId, { ids: body.ids.map(String) }));
}

/** PUT /notifications/push-token — {token, previous?} → {push}. Token vazio tira o aparelho. */
export async function savePushToken(req, res) {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  const previous = typeof req.body?.previous === "string" ? req.body.previous : "";
  res.json(await NotificationService.savePushToken(req.userId, token, previous));
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
  // Usa o cache da sessão (o mesmo do requireAuth) e só fecha se a conta foi apagada (401) ou banida (403):
  // servidor fora do ar por um instante não derruba o tempo real de ninguém.
  const sessionCheck = setInterval(() => {
    ensureActiveSession(req.userId).catch((error) => {
      if (error.status !== 401 && error.status !== 403) return;
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
