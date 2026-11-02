import { AppIcon, BrandName } from "./illustrations.jsx";
import "./splash-screen.css";

/**
 * Abertura do app (enquanto confere a sessão salva ou carrega uma tela pesada, como a câmera).
 * onRetry = mostra o botão "Tentar de novo" (ex.: servidor fora do ar).
 */
export function SplashScreen({ message = "Abrindo o Signa Ludus…", onRetry }) {
  return (
    <div className="splash" role={onRetry ? "alert" : "status"}>
      <div className="splash__icon">
        <AppIcon size={104} />
      </div>
      <p className="splash__name"><BrandName height={34} /></p>
      <p className="splash__message">{message}</p>
      {onRetry && (
        <button type="button" className="splash__retry" onClick={onRetry}>
          Tentar de novo
        </button>
      )}
    </div>
  );
}
