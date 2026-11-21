import { useEffect, useState } from "react";

/**
 * Fila de avisos mostrados um de cada vez: cada um fica `durationMs` na tela e dá lugar ao próximo.
 * @param {{id: string}[]} items - lista que só cresce (avisos novos entram no fim).
 * @param {number} durationMs
 * @param {(item: object) => void} [onShow] - chamado quando um aviso aparece (ex.: tocar a fanfarra).
 * @returns {{current: object|undefined, next: () => void}} current = aviso na tela; next = pula para o próximo.
 * Usado por: AchievementToast e NotificationToast.
 */
export function useToastQueue(items, durationMs, onShow) {
  const [index, setIndex] = useState(0);
  const current = items[index];
  const next = () => setIndex((value) => value + 1);

  useEffect(() => {
    if (!current) return undefined;
    onShow?.(current);
    const timer = setTimeout(next, durationMs);
    return () => clearTimeout(timer);
    // Só reage à troca de aviso (onShow pode ser uma função nova a cada redesenho).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, current?.id, durationMs]);

  return { current, next };
}
