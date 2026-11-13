import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ScreenWithNav, LoadingState } from "../../components/layout.jsx";
import { useNotifications } from "../../features/notifications/NotificationsContext.jsx";
import "../../features/notifications/notifications.css";

/** Ícone de cada tipo (config/notification-types.js no servidor). */
const TYPE_ICONS = {
  achievement_unlocked: "🏅",
  level_up: "⬆️",
  xp_bonus: "✨",
  streak_reminder: "🔥",
  event_started: "🎉",
  app_update: "📲",
  account_restored: "✅",
  manual: "📣",
};

const formatWhen = (date) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(date));

/**
 * Notificações: as últimas 50, as não lidas destacadas. Tocar marca como lida e abre a tela ligada a ela.
 * Ao sair da tela, todas ficam lidas (o número do sino zera).
 * Usado por: App.jsx (/notificacoes), sino da trilha e toque na notificação do celular.
 */
export function NotificationsPage() {
  const { notifications, unread, loaded, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();

  // Abriu a tela = viu as notificações: zera o sino ao sair.
  useEffect(() => () => markAllRead(), [markAllRead]);

  const open = (item) => {
    if (!item.read) markRead([item.id]);
    if (item.link && item.link !== "/notificacoes") navigate(item.link);
  };

  return (
    <ScreenWithNav title="Notificações" backTo={-1}>
      {!loaded ? (
        <LoadingState message="Carregando notificações…" />
      ) : notifications.length === 0 ? (
        <p className="notifications-empty">Nenhuma notificação ainda. Conquistas, eventos e avisos aparecem aqui.</p>
      ) : (
        <>
          {unread > 0 && (
            <div className="notifications-actions">
              <button type="button" className="button-link" onClick={markAllRead}>Marcar todas como lidas</button>
            </div>
          )}
          <ul className="notifications-list">
            {notifications.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`notification-item${item.read ? "" : " notification-item--unread"}`}
                  onClick={() => open(item)}
                  aria-label={`${item.read ? "" : "Não lida. "}${item.title}. ${item.body}`}
                >
                  <span className="notification-item__icon" aria-hidden="true">{TYPE_ICONS[item.type] ?? "🔔"}</span>
                  <span className="notification-item__text">
                    <strong>{item.title}</strong>
                    {item.body && <span>{item.body}</span>}
                    <time dateTime={item.createdAt}>{formatWhen(item.createdAt)}</time>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </ScreenWithNav>
  );
}
