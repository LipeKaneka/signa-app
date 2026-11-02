import { useCallback, useEffect, useRef, useState } from "react";

/** Folga além da animação de saída (220 ms): garante o fechamento se o animationend não vier. */
const DEFAULT_FALLBACK_MS = 600;

/**
 * Saída animada com garantia: liga a classe de saída e chama onExited ao fim da animação
 * (ou depois de fallbackMs, se o animationend não vier).
 * @param {() => void} onExited
 * @param {number} [fallbackMs=600]
 * @returns {{leaving: boolean, startLeaving: () => void, handleAnimationEnd: (event) => void}}
 * Usado por: FeedbackSheet (atividade) e TranslatorDrawer (câmera). Útil para futuros avisos de conquista.
 */
export function useExitAnimation(onExited, fallbackMs = DEFAULT_FALLBACK_MS) {
  const [leaving, setLeaving] = useState(false);
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;
  const finishedRef = useRef(false);
  const fallbackTimerRef = useRef(null);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearTimeout(fallbackTimerRef.current);
    onExitedRef.current();
  }, []);

  const startLeaving = useCallback(() => {
    if (fallbackTimerRef.current) return;
    setLeaving(true);
    fallbackTimerRef.current = setTimeout(finish, fallbackMs);
  }, [finish, fallbackMs]);

  const handleAnimationEnd = useCallback(
    (event) => {
      if (event.target === event.currentTarget && fallbackTimerRef.current) finish();
    },
    [finish],
  );

  useEffect(() => () => clearTimeout(fallbackTimerRef.current), []);
  return { leaving, startLeaving, handleAnimationEnd };
}
