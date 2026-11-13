import { getEnvironment } from "../config/env.js";
import { callServer, userPath } from "../clients/server-client.js";

/**
 * Notificações: lista, lidas e aparelho do celular vão ao servidor; o TEMPO REAL vem de um fluxo único com o
 * servidor (GET /internal/v1/notifications/stream), aberto só enquanto algum app estiver conectado aqui, e
 * repassado ao app certo (por id de usuário).
 */
const RECONNECT_MIN_MS = 2 * 1000;
const RECONNECT_MAX_MS = 60 * 1000;

/** userId → conjunto de funções que entregam a notificação a cada app conectado dessa pessoa. */
const listeners = new Map();
let upstream = null;
let reconnectDelay = RECONNECT_MIN_MS;
let reconnectTimer = null;

/** @returns {Promise<{notifications: object[], unread: number}>} Usado por: GET /notifications. */
export function listNotifications(userId) {
  return callServer(userPath(userId, "/notifications"));
}

/** @returns {Promise<{unread: number}>} Usado por: POST /notifications/read. */
export function markNotificationsRead(userId, body) {
  return callServer(userPath(userId, "/notifications/read"), { method: "POST", body });
}

/** @returns {Promise<{push: boolean}>} Usado por: PUT /notifications/push-token. */
export function savePushToken(userId, token, previous) {
  return callServer(userPath(userId, "/push-token"), { method: "PUT", body: { token, previous } });
}

/** Lê o fluxo SSE do servidor e entrega cada notificação a quem está conectado. */
async function readUpstream(response, signal) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  reconnectDelay = RECONNECT_MIN_MS;
  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
      if (!data) continue;
      try {
        const { userId, notification } = JSON.parse(data);
        listeners.get(String(userId))?.forEach((deliver) => deliver(notification));
      } catch {
        // mensagem inválida: ignora
      }
    }
  }
}

/** Abre (ou reabre) o fluxo com o servidor enquanto houver app conectado. */
function connectUpstream() {
  if (upstream || listeners.size === 0) return;
  const controller = new AbortController();
  upstream = controller;
  const { serverUrl, serverServiceKey } = getEnvironment();
  fetch(`${serverUrl}/notifications/stream`, {
    headers: { "X-Service-Key": serverServiceKey, Accept: "text/event-stream" },
    signal: controller.signal,
  })
    .then((response) => {
      if (!response.ok || !response.body) throw new Error(`servidor respondeu ${response.status}`);
      return readUpstream(response, controller.signal);
    })
    .catch((error) => {
      if (!controller.signal.aborted) console.error("Fluxo de notificações com o servidor caiu:", error.message);
    })
    .finally(() => {
      if (upstream === controller) upstream = null;
      if (controller.signal.aborted || listeners.size === 0) return;
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectUpstream, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
    });
}

/**
 * Passa a receber as notificações de uma pessoa em tempo real.
 * @param {string} userId
 * @param {(notification: object) => void} deliver
 * @returns {() => void} chamar para parar (app desconectou).
 * Usado por: GET /notifications/stream.
 */
export function subscribe(userId, deliver) {
  const key = String(userId);
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(deliver);
  connectUpstream();
  return () => {
    const set = listeners.get(key);
    set?.delete(deliver);
    if (set?.size === 0) listeners.delete(key);
    if (listeners.size === 0 && upstream) {
      upstream.abort();
      upstream = null;
    }
  };
}

/** Só para testes: fecha o fluxo e esquece os conectados. */
export function resetNotificationStream() {
  upstream?.abort();
  upstream = null;
  clearTimeout(reconnectTimer);
  listeners.clear();
}
