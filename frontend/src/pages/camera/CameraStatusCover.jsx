import { Icon } from "../../components/Icon.jsx";
import { LogoHand } from "../../components/illustrations.jsx";

/**
 * Capa por cima da câmera enquanto ela abre (ou quando não abre). Mostra só textos amigáveis;
 * o erro técnico fica no console. "Tentar de novo" recarrega a tela, que reabre a câmera do zero.
 */
export function CameraStatusCover({ camera }) {
  const failed = camera.status === "error";
  return (
    <div className={`camera-cover${failed ? " camera-cover--error" : ""}`} role={failed ? "alert" : "status"}>
      <span className="camera-cover__badge" aria-hidden="true">
        {failed ? <Icon name="camera" size={40} strokeWidth={1.4} /> : <LogoHand size={44} color="#fff" />}
      </span>
      <p className="camera-cover__title">{failed ? "A câmera não abriu" : "Preparando a câmera…"}</p>
      <p className="camera-cover__text">{failed ? camera.error : camera.step}</p>
      {failed ? (
        <button type="button" className="camera-cover__retry" onClick={() => window.location.reload()}>
          <Icon name="replay" size={16} /> Tentar de novo
        </button>
      ) : (
        <span className="camera-cover__dots" aria-hidden="true"><i /><i /><i /></span>
      )}
    </div>
  );
}
