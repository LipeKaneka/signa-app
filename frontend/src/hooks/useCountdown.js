import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Contagem regressiva (3, 2, 1…) antes de gravar.
 * @returns {{count: number|null, start: (seconds: number, onDone: () => void) => void}}
 * Usado por: TeachSignPage e HandAnalysisPage.
 */
export function useCountdown() {
  const [count, setCount] = useState(null);
  const timerRef = useRef(null);

  const start = useCallback((seconds, onDone) => {
    clearInterval(timerRef.current);
    let remaining = seconds;
    setCount(remaining);
    timerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        setCount(remaining);
        return;
      }
      clearInterval(timerRef.current);
      setCount(null);
      onDone();
    }, 1000);
  }, []);

  useEffect(() => () => clearInterval(timerRef.current), []);
  return { count, start };
}
