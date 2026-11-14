import { openApiStream, requestApi } from "./http-client.js";

/** @returns {Promise<{notifications: object[], unread: number}>} Últimas 50 e quantas não foram lidas. */
export function fetchNotifications() {
  return requestApi("/notifications");
}

/** @param {string[]|"all"} ids @returns {Promise<{unread: number}>} */
export function markNotificationsRead(ids) {
  return requestApi("/notifications/read", { method: "POST", body: ids === "all" ? { all: true } : { ids } });
}

/**
 * Notificações novas, na hora. Termina quando o fluxo fecha (quem chama reconecta).
 * @param {(notification: object) => void} onNotification
 * @param {AbortSignal} signal
 */
export function streamNotifications(onNotification, signal) {
  return openApiStream("/notifications/stream", (event, data) => {
    if (event === "notification") onNotification(data);
  }, signal);
}
