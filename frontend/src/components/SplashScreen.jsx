import { useEffect, useState } from "react";
import { AppIcon, BrandName } from "./illustrations.jsx";

/** Depois de quanto tempo carregando aparece a explicação de demora. */
const SLOW_HINT_AFTER_MS = 4000;
import "./splash-screen.css";

/**
 * Abertura do app (enquanto confere a sessão salva ou carrega uma tela pesada, como a câmera).
 * onRetry = mostra o botão "Tentar de novo" (ex.: servidor fora do ar).
 */
export function SplashScreen({ message = "Abrindo o Signa Ludus…", onRetry, slowHint }) {
  // Se demorar, explica o motivo (servidor grátis acordando) para a pessoa não achar que travou.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!slowHint) return undefined;
    const timer = setTimeout(() => setSlow(true), SLOW_HINT_AFTER_MS);
    return () => clearTimeout(timer);
  }, [slowHint]);

  return (
    <div className="splash" role={onRetry ? "alert" : "status"}>
      <div className="splash__icon">
        <AppIcon size={104} />
      </div>
      <p className="splash__name"><BrandName height={34} /></p>
      <p className="splash__message">{message}</p>
      {slow && <p className="splash__message splash__hint">{slowHint}</p>}
      {onRetry && (
        <button type="button" className="splash__retry" onClick={onRetry}>
          Tentar de novo
        </button>
      )}
    </div>
  );
}
