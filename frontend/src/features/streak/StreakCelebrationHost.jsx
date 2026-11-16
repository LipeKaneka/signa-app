import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { StreakCelebration } from "./StreakCelebration.jsx";

const PENDING_KEY = "signa-ludus:streak-celebration";

/**
 * Guarda a animação de ofensiva para mostrar quando a pessoa voltar para a trilha (sobrevive à troca de tela).
 * @param {number} from - ofensiva antes da atividade.
 * @param {number} to - ofensiva depois (maior que from).
 * Usado por: ActivityPage, ao concluir uma atividade que aumentou a ofensiva.
 */
export function queueStreakCelebration(from, to) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ from, to }));
  } catch {
    // Sem armazenamento (modo privado): só não mostra a animação.
  }
}

function takePending() {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    const value = raw ? JSON.parse(raw) : null;
    return Number.isFinite(value?.to) && Number.isFinite(value?.from) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Mostra a animação pendente ao chegar na trilha ou na tela do módulo (para onde o "Continuar" do resultado leva).
 * Usado por: App.jsx (só com a pessoa logada).
 */
export function StreakCelebrationHost() {
  const { pathname } = useLocation();
  const [celebration, setCelebration] = useState(null);

  useEffect(() => {
    if (!pathname.startsWith("/trilha")) return;
    const pending = takePending();
    if (pending) setCelebration(pending);
  }, [pathname]);

  if (!celebration) return null;
  return <StreakCelebration from={celebration.from} to={celebration.to} onDone={() => setCelebration(null)} />;
}
