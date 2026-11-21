import { useEffect } from "react";

/**
 * Chama onEscape quando a tecla Esc é apertada (o voltar do Android também manda um Esc para janelas abertas).
 * @param {() => void} onEscape
 * Usado por: BanDialog e SignDialog.
 */
export function useEscapeKey(onEscape) {
  useEffect(() => {
    const handleKeyDown = (event) => event.key === "Escape" && onEscape();
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onEscape]);
}
