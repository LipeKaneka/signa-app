import { useEffect, useState } from "react";
import "../../components/achievement-toast.css";
import "./notifications.css";

/** Quanto tempo cada aviso fica na tela. */
const TOAST_DURATION_MS = 4500;

/**
 * Aviso no topo para cada notificação que chega com o app aberto, um de cada vez (mesmo visual do aviso de
 * conquista). Tocar abre a tela da notificação.
 * @param {{items: {id: string, title: string, body: string, link: string}[], onOpen: (item: object) => void}} props
 * Usado por: NotificationsProvider.
 */
export function NotificationToast({ items, onOpen }) {
  const [index, setIndex] = useState(0);
  const current = items[index];

  useEffect(() => {
    if (!current) return undefined;
    const timer = setTimeout(() => setIndex((value) => value + 1), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [index, current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!current) return null;
  return (
    <div className="achievement-toast-area" role="status" aria-live="polite">
      <button
        key={current.id}
        type="button"
        className="achievement-toast notification-toast"
        onClick={() => {
          setIndex((value) => value + 1);
          onOpen(current);
        }}
        aria-label={`Notificação: ${current.title}. ${current.body ?? ""} Toque para abrir.`}
      >
        <span className="achievement-toast__text">
          <strong>{current.title}</strong>
          {current.body && <span className="notification-toast__body">{current.body}</span>}
        </span>
      </button>
    </div>
  );
}
