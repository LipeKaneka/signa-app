import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon.jsx";
import { CameraStatusCover } from "./CameraStatusCover.jsx";
import "./camera-tool.css";

/**
 * Tela das ferramentas da câmera (ensinar sinal, análise da mão): imagem da câmera em cima,
 * com sobreposições (overlay), e o painel de controles embaixo. Sempre câmera frontal (espelhada).
 */
export function CameraToolLayout({ title, camera, overlay, children }) {
  const navigate = useNavigate();
  return (
    <div className="camera-tool">
      <header className="camera-header">
        <button type="button" className="icon-button" onClick={() => navigate("/camera")} aria-label="Voltar para a câmera">
          <Icon name="back" size={22} />
        </button>
        <h1 className="camera-header__title">{title}</h1>
      </header>

      <div className="camera-tool__view">
        <video ref={camera.videoRef} playsInline muted aria-label="Imagem da câmera" />
        <canvas ref={camera.canvasRef} aria-hidden="true" />
        {camera.status !== "ready" && <CameraStatusCover camera={camera} />}
        <div className="camera-tool__overlay">
          {overlay}
        </div>
      </div>

      <main className="camera-tool__panel">{children}</main>
    </div>
  );
}

/** Número grande da contagem ou progresso da gravação, por cima da câmera. */
export function RecordingBadge({ countdown, text }) {
  if (countdown == null && !text) return null;
  return (
    <div className="recording-badge" role="status">
      {countdown != null ? <strong>{countdown}</strong> : <span>{text}</span>}
    </div>
  );
}
