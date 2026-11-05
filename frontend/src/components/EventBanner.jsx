import { useAppConfig } from "../context/AppConfigContext.jsx";
import "./event-banner.css";

/**
 * Quando o evento termina, em texto curto: "até 22:00" (hoje), "até amanhã, 22:00" ou "até sáb., 22:00".
 * @param {string} endsAt
 * @param {number} [now]
 * @returns {string}
 */
export function describeEventEnd(endsAt, now = Date.now()) {
  const end = new Date(endsAt);
  const time = end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dayOf = (date) => new Date(date).toDateString();
  if (dayOf(end) === dayOf(now)) return `até ${time}`;
  if (dayOf(end) === dayOf(now + 24 * 60 * 60 * 1000)) return `até amanhã, ${time}`;
  const weekday = end.toLocaleDateString("pt-BR", { weekday: "short" });
  return `até ${weekday} ${end.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}, ${time}`;
}

/** Multiplicador em texto ("2x", "1,5x"). */
export function formatMultiplier(multiplier) {
  return `${String(multiplier).replace(".", ",")}x`;
}

/**
 * Variáveis CSS da faixa a partir da aparência escolhida no painel (estilo, cores e ícone).
 * Sem aparência (evento antigo ou servidor desatualizado), vale o padrão do CSS (roxo da marca).
 * @param {object|undefined} appearance
 * @returns {Record<string, string>}
 */
function appearanceStyle(appearance) {
  if (!appearance) return {};
  const { style, colorFrom, colorTo, textColor, accentColor, accentTextColor } = appearance;
  return {
    "--event-background": style === "gradient" ? `linear-gradient(90deg, ${colorFrom} 0%, ${colorTo} 100%)` : style === "solid" ? colorFrom : "#ffffff",
    "--event-border": style === "outline" ? colorFrom : "transparent",
    "--event-text": textColor,
    "--event-accent": accentColor,
    "--event-accent-text": accentTextColor,
  };
}

/**
 * Faixa "2x XP" exibida enquanto um evento de XP estiver valendo (criado no painel; some sozinha no fim).
 * compact: versão de uma linha (dentro da atividade).
 * Usado por: TrailPage e ActivityPage.
 */
export function EventBanner({ compact = false }) {
  const { xpEvent } = useAppConfig();
  if (!xpEvent) return null;
  const multiplier = formatMultiplier(xpEvent.multiplier);

  return (
    <aside className={`event-banner${compact ? " event-banner--compact" : ""}`} style={appearanceStyle(xpEvent.appearance)} aria-label={`Evento: ${multiplier} XP`}>
      <span className="event-banner__badge" aria-hidden="true">{multiplier}</span>
      <div className="event-banner__text">
        <strong>{xpEvent.appearance?.icon ? `${xpEvent.appearance.icon} ` : ""}{xpEvent.title}</strong>
        <span>
          {compact ? `XP ${multiplier} ` : `Todo XP vale ${multiplier} `}
          {describeEventEnd(xpEvent.endsAt)}
          {!compact && xpEvent.description ? ` · ${xpEvent.description}` : ""}
        </span>
      </div>
    </aside>
  );
}
