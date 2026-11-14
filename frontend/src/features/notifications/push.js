import { Capacitor } from "@capacitor/core";
import * as NotificationsApi from "../../api/api-notifications.js";
import { readStoredToken } from "../../utils/session-storage.js";

/** Último token do Firebase deste aparelho (para trocar/tirar no servidor). */
const PUSH_TOKEN_KEY = "signa-push-token";
/** Canal do Android (o servidor manda com channel_id "avisos"). */
const CHANNEL = { id: "avisos", name: "Avisos do Signa", description: "Conquistas, eventos, ofensiva e avisos", importance: 4 };

/* global __PUSH_ENABLED__ */
/** Push só no APK gerado com o google-services.json (vite.config.js); no navegador, nunca. */
export const PUSH_AVAILABLE = typeof __PUSH_ENABLED__ !== "undefined" && __PUSH_ENABLED__ && Capacitor.isNativePlatform();

const readSavedToken = () => {
  try {
    return localStorage.getItem(PUSH_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
};
const writeSavedToken = (token) => {
  try {
    if (token) localStorage.setItem(PUSH_TOKEN_KEY, token);
    else localStorage.removeItem(PUSH_TOKEN_KEY);
  } catch {
    // sem armazenamento: o servidor só não fica sabendo do token antigo
  }
};

/**
 * Liga a notificação no celular: pede permissão, registra o aparelho no Firebase e manda o token ao servidor.
 * Tocar numa notificação abre a tela dela (onOpen recebe o link).
 * @param {(link: string) => void} onOpen
 * @returns {Promise<() => void>} desliga os ouvintes.
 * Usado por: NotificationsProvider (com "Notificações" ligado em Configurações).
 */
export async function enablePush(onOpen) {
  if (!PUSH_AVAILABLE) return () => {};
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const handles = await Promise.all([
    // Manda sempre (mesmo token igual ao salvo): o servidor pode ter perdido o registro, e assim ele volta
    // toda vez que o app abre.
    PushNotifications.addListener("registration", ({ value }) => {
      const previous = readSavedToken();
      NotificationsApi.savePushToken(value, previous === value ? "" : previous).then(() => writeSavedToken(value)).catch(() => {});
    }),
    PushNotifications.addListener("registrationError", (error) => console.warn("Push: registro falhou", error)),
    PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
      onOpen(notification?.data?.link || "/notificacoes");
    }),
  ]);
  try {
    await PushNotifications.createChannel(CHANNEL).catch(() => {});
    let { receive } = await PushNotifications.checkPermissions();
    if (receive === "prompt" || receive === "prompt-with-rationale") ({ receive } = await PushNotifications.requestPermissions());
    if (receive === "granted") await PushNotifications.register();
  } catch (error) {
    console.warn("Push indisponível:", error);
  }
  return () => handles.forEach((handle) => handle.remove());
}

/**
 * Tira este aparelho do servidor (notificações desligadas em Configurações, ou saída da conta).
 * Só chama a API com sessão aberta (sem ela, a chamada daria 401 e sairia da conta de novo).
 * Usado por: NotificationsProvider e AuthContext.signOut.
 */
export function forgetPushToken() {
  const token = readSavedToken();
  if (!token || !readStoredToken()) return;
  writeSavedToken("");
  NotificationsApi.savePushToken("", token).catch(() => {});
}
