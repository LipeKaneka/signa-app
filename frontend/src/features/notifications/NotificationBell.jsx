import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon.jsx";
import { useNotifications } from "./NotificationsContext.jsx";
import "./notifications.css";

/**
 * Sino com o número de notificações não lidas; abre a tela Notificações.
 * Usado por: TrailHeader (cabeçalho da trilha).
 */
export function NotificationBell() {
  const { unread } = useNotifications();
  const navigate = useNavigate();
  const label = unread > 0 ? `Notificações: ${unread} não ${unread === 1 ? "lida" : "lidas"}` : "Notificações";
  return (
    <button type="button" className="notification-bell" onClick={() => navigate("/notificacoes")} aria-label={label}>
      <Icon name="bell" size={24} strokeWidth={2} />
      {unread > 0 && <span className="notification-bell__badge" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
    </button>
  );
}
