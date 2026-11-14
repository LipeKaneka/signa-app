import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as NotificationsApi from "../../api/api-notifications.js";
import { useSettings } from "../../context/SettingsContext.jsx";
import { NotificationToast } from "./NotificationToast.jsx";

/** Espera para reconectar o tempo real (dobra a cada queda, até 1 min). */
const RECONNECT_MIN_MS = 2 * 1000;
const RECONNECT_MAX_MS = 60 * 1000;
/** Estes já têm aviso próprio na tela onde acontecem (fim da atividade, acerto): não repete o aviso no topo. */
const SILENT_IN_APP = new Set(["achievement_unlocked", "level_up"]);

const EMPTY = { notifications: [], unread: 0, loaded: false, connected: false, reload: () => {}, markAllRead: () => {}, markRead: () => {} };
const NotificationsContext = createContext(EMPTY);

/**
 * Notificações da pessoa logada: lista (sino e tela Notificações), contador de não lidas, tempo real (as novas
 * chegam na hora pelo GET /notifications/stream, com aviso no topo) e notificação no celular com o app fechado.
 * "Notificações" desligado em Configurações: sem aviso no topo e sem celular (o sino continua).
 * Usado por: App.jsx (só com a pessoa logada).
 */
export function NotificationsProvider({ children }) {
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [state, setState] = useState({ notifications: [], unread: 0, loaded: false });
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState([]);
  const showToasts = useRef(settings.notifications);
  showToasts.current = settings.notifications;

  const reload = useCallback(() => {
    NotificationsApi.fetchNotifications()
      .then(({ notifications, unread }) => setState({ notifications, unread, loaded: true }))
      .catch(() => setState((current) => ({ ...current, loaded: true })));
  }, []);

  const receive = useCallback((notification) => {
    setState((current) => {
      if (current.notifications.some((item) => item.id === notification.id)) return current;
      return { ...current, notifications: [notification, ...current.notifications].slice(0, 50), unread: current.unread + 1 };
    });
    if (showToasts.current && !SILENT_IN_APP.has(notification.type)) setToasts((current) => [...current, notification]);
  }, []);

  // Tempo real: conecta, reconecta se cair e volta a conectar quando o app volta da tela de fundo.
  useEffect(() => {
    let controller = null;
    let timer = null;
    let delay = RECONNECT_MIN_MS;
    let stopped = false;

    const connect = () => {
      if (stopped || controller || document.visibilityState === "hidden") return;
      controller = new AbortController();
      const current = controller;
      setConnected(true);
      NotificationsApi.streamNotifications((notification) => {
        delay = RECONNECT_MIN_MS;
        receive(notification);
      }, current.signal)
        .catch(() => {})
        .finally(() => {
          if (controller === current) controller = null;
          setConnected(false);
          if (stopped || current.signal.aborted) return;
          timer = setTimeout(connect, delay);
          delay = Math.min(delay * 2, RECONNECT_MAX_MS);
        });
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        reload(); // o que chegou enquanto o app estava fechado
        clearTimeout(timer);
        delay = RECONNECT_MIN_MS;
        connect();
      } else {
        controller?.abort();
        controller = null;
      }
    };

    reload();
    connect();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [receive, reload]);

  const markRead = useCallback((ids) => {
    if (!ids.length) return;
    setState((current) => {
      const unreadIds = new Set(current.notifications.filter((item) => !item.read && ids.includes(item.id)).map((item) => item.id));
      return {
        ...current,
        unread: Math.max(0, current.unread - unreadIds.size),
        notifications: current.notifications.map((item) => (unreadIds.has(item.id) ? { ...item, read: true } : item)),
      };
    });
    NotificationsApi.markNotificationsRead(ids).then(({ unread }) => setState((current) => ({ ...current, unread }))).catch(() => {});
  }, []);

  const markAllRead = useCallback(() => {
    setState((current) => ({ ...current, unread: 0, notifications: current.notifications.map((item) => ({ ...item, read: true })) }));
    NotificationsApi.markNotificationsRead("all").catch(() => {});
  }, []);

  const openToast = useCallback((notification) => {
    markRead([notification.id]);
    if (notification.link) navigate(notification.link);
  }, [markRead, navigate]);

  const value = useMemo(
    () => ({ ...state, connected, reload, markRead, markAllRead }),
    [state, connected, reload, markRead, markAllRead],
  );
  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <NotificationToast items={toasts} onOpen={openToast} />
    </NotificationsContext.Provider>
  );
}

/**
 * @returns {{notifications: object[], unread: number, loaded: boolean, connected: boolean, reload: () => void,
 *   markRead: (ids: string[]) => void, markAllRead: () => void}}
 */
export function useNotifications() {
  return useContext(NotificationsContext);
}
