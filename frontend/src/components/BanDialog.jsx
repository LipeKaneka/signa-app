import { useEffect } from "react";
import { Icon } from "./Icon.jsx";
import "./ban-dialog.css";

/** "12/11/2026 às 14:30" no horário do aparelho. */
function formatEnd(until) {
  const date = new Date(until);
  return `${date.toLocaleDateString("pt-BR")} às ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** "faltam 3 dias", "faltam 5 horas", "falta menos de 1 hora". */
function describeRemaining(until) {
  const ms = new Date(until).getTime() - Date.now();
  const hours = Math.ceil(ms / (60 * 60 * 1000));
  if (hours <= 1) return "falta menos de 1 hora";
  if (hours < 48) return `faltam ${hours} horas`;
  return `faltam ${Math.ceil(hours / 24)} dias`;
}

/**
 * Aviso de conta banida: motivo e até quando vale (ou "sem prazo"). Aparece no login quando a pessoa tenta entrar.
 * @param {{ban: {reason: string, until: string|null}, onClose: () => void}} props
 * Usado por: LoginPage.
 */
export function BanDialog({ ban, onClose }) {
  useEffect(() => {
    const closeOnEscape = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="ban-dialog" role="alertdialog" aria-modal="true" aria-labelledby="ban-dialog-title" aria-describedby="ban-dialog-body">
      <div className="ban-dialog__card">
        <span className="ban-dialog__icon" aria-hidden="true"><Icon name="lockClosed" size={28} /></span>
        <h2 id="ban-dialog-title" className="ban-dialog__title">Conta banida</h2>
        <div id="ban-dialog-body">
          <p className="ban-dialog__label">Motivo</p>
          <p className="ban-dialog__value">{ban.reason || "Não informado."}</p>
          <p className="ban-dialog__label">Duração</p>
          <p className="ban-dialog__value">
            {ban.until ? <>Até {formatEnd(ban.until)} <span className="ban-dialog__muted">({describeRemaining(ban.until)})</span></> : "Sem prazo para terminar."}
          </p>
          <p className="ban-dialog__hint">
            {ban.until ? "Depois disso, você poderá entrar normalmente." : "Se achar que foi um engano, fale com a equipe do Signa Ludus."}
          </p>
        </div>
        <button type="button" className="button-primary ban-dialog__button" onClick={onClose} autoFocus>Entendi</button>
      </div>
    </div>
  );
}
