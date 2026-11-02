import { useEffect, useState } from "react";
import { useSettings } from "../context/SettingsContext.jsx";
import { playCelebrationFeedback } from "../utils/feedback-effects.js";
import { AchievementMedal } from "./illustrations.jsx";
import "./achievement-toast.css";

/** Quanto tempo cada aviso fica na tela. */
const TOAST_DURATION_MS = 3800;

/**
 * Avisos que descem do topo, um de cada vez: conquistas desbloqueadas e subida de nível.
 * Toca a fanfarra (se "Efeitos sonoros e vibrações" estiver ligado) a cada aviso; tocar no aviso fecha.
 * @param {{items: {id: string, kind: "achievement"|"level", title: string}[]}} props
 * Usado por: ActivityResult.
 */
export function AchievementToast({ items }) {
  const { settings } = useSettings();
  const [index, setIndex] = useState(0);
  const current = items[index];

  useEffect(() => {
    if (!current) return undefined;
    playCelebrationFeedback(settings.soundsAndVibration);
    const timer = setTimeout(() => setIndex((value) => value + 1), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, current?.id]);

  if (!current) return null;
  return (
    <div className="achievement-toast-area" role="status" aria-live="polite">
      <button
        key={current.id}
        type="button"
        className="achievement-toast"
        onClick={() => setIndex((value) => value + 1)}
        aria-label={`${current.kind === "level" ? "Novo nível" : "Conquista desbloqueada"}: ${current.title}. Toque para fechar.`}
      >
        <span className="achievement-toast__medal" aria-hidden="true">
          {current.kind === "level" ? "⬆" : <AchievementMedal size={36} />}
        </span>
        <span className="achievement-toast__text">
          <small>{current.kind === "level" ? "Você subiu de nível!" : "Conquista desbloqueada!"}</small>
          <strong>{current.title}</strong>
        </span>
      </button>
    </div>
  );
}
