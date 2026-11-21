import { useSettings } from "../context/SettingsContext.jsx";
import { useToastQueue } from "../hooks/useToastQueue.js";
import { playCelebrationFeedback } from "../utils/feedback-effects.js";
import { AchievementBadge, achievementStyle } from "./AchievementCard.jsx";
import "./achievement-toast.css";

/** Quanto tempo cada aviso fica na tela. */
const TOAST_DURATION_MS = 3800;

/**
 * Conquista do servidor ({id, title, appearance, rarity}) no formato de um aviso do AchievementToast.
 * Usado por: ActivityPage, ActivityResult e AppEventsProvider.
 */
export function toAchievementToast(achievement) {
  return {
    id: `achievement-${achievement.id}`,
    kind: "achievement",
    title: achievement.title,
    appearance: achievement.appearance,
    rarity: achievement.rarity,
  };
}

/**
 * Avisos que descem do topo, um de cada vez: conquistas desbloqueadas e subida de nível.
 * Toca a fanfarra (se "Efeitos sonoros e vibrações" estiver ligado) a cada aviso; tocar no aviso fecha.
 * @param {{items: {id: string, kind: "achievement"|"level", title: string, appearance?: object, rarity?: object}[]}} props
 * appearance e rarity (da conquista, vindas do servidor) = medalha com a imagem/cores e o nome da raridade.
 * Usado por: ActivityResult (fim da atividade) e ActivityPage (conquistas de acertos, na hora).
 */
export function AchievementToast({ items }) {
  const { settings } = useSettings();
  const { current, next } = useToastQueue(items, TOAST_DURATION_MS, () => playCelebrationFeedback(settings.soundsAndVibration));

  if (!current) return null;
  return (
    <div className="achievement-toast-area" role="status" aria-live="polite">
      <button
        key={current.id}
        type="button"
        className="achievement-toast"
        style={achievementStyle(current.appearance)}
        onClick={next}
        aria-label={`${current.kind === "level" ? "Novo nível" : "Conquista desbloqueada"}: ${current.title}. Toque para fechar.`}
      >
        <span className="achievement-toast__medal" aria-hidden="true">
          {current.kind === "level" ? "⬆" : <AchievementBadge appearance={current.appearance} size={48} />}
        </span>
        <span className="achievement-toast__text">
          <small>
            {current.kind === "level" ? "Você subiu de nível!" : "Conquista desbloqueada!"}
            {current.rarity && <span className="achievement-toast__tier"> · {current.rarity.label}</span>}
          </small>
          <strong>{current.title}</strong>
        </span>
      </button>
    </div>
  );
}
