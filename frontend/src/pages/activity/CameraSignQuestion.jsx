import { useCallback, useMemo, useRef, useState } from "react";
import { Icon } from "../../components/Icon.jsx";
import { HandDrawing } from "../../components/illustrations.jsx";
import { SignDialog } from "../../components/SignDialog.jsx";
import { amostrasBase as readBaseSamples, todasAmostras as readAllSamples } from "../../features/translator/engine/classificador.js";
import { lerPerfil as readHandProfile } from "../../features/translator/engine/perfil.js";
import { useHandCamera } from "../../features/translator/useHandCamera.js";
import { SENSITIVITIES, useSignTranslator } from "../../features/translator/useSignTranslator.js";
import "../camera/camera.css";

/** Compara rótulos sem diferenciar maiúsculas nem acentos ("maçã" = "Maçã"). */
const sameLabel = (a, b) =>
  String(a).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() ===
  String(b).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Desenho da mão da letra-alvo, tirado da primeira foto de referência dela. */
function findLetterDrawing(letter) {
  return readBaseSamples().find((sample) => sample.rotulo === letter)?.p ?? null;
}

/** Texto curto do que o app está vendo, para guiar a pessoa. */
function describeProgress(translator, targetKind) {
  const { event, handState, currentLetter } = translator;
  if (event?.type === "word" || event?.type === "gesture") return `O app viu: ${event.text}`;
  if (event?.text) return event.text;
  if (targetKind === "word") {
    if (handState === "none") return "Comece com as mãos abaixadas, faça o sinal inteiro e abaixe as mãos no fim.";
    return translator.isGestureActive() ? "Termine o gesto e abaixe as mãos" : "Faça o sinal…";
  }
  if (handState === "none") return "Mostre a mão para a câmera";
  if (handState === "moving") return "Segure a mão parada…";
  if (currentLetter?.rotulo) return `O app vê: ${currentLetter.rotulo}`;
  return "Mão detectada, ajuste o formato da mão";
}

/**
 * Pergunta "Faça o sinal" (camera_sign): a câmera abre dentro da atividade e o reconhecedor do app (o mesmo do
 * tradutor) confere o gesto. Reconheceu o alvo = "done"; "Pular" = "skip"; sem câmera = "unavailable"
 * (não conta na nota). Tudo roda no aparelho: nenhuma imagem sai do celular.
 * @param {{question: {target: string, targetKind: "letter"|"word", avatar: object|null}, answered: boolean,
 *   onAnswer: (optionId: "done"|"skip"|"unavailable") => Promise<boolean>}} props
 * Usado por: ActivityPage (carregado só quando a atividade tem pergunta de câmera).
 */
export default function CameraSignQuestion({ question, answered, onAnswer }) {
  const { target, targetKind, avatar } = question;
  const profile = useMemo(() => readHandProfile(), []);
  const samples = useMemo(() => readAllSamples(profile?.escala), [profile]);
  const letterDrawing = useMemo(() => (targetKind === "letter" ? findLetterDrawing(target) : null), [target, targetKind]);
  const [showingSign, setShowingSign] = useState(false);
  const answeredRef = useRef(false);
  const [recognized, setRecognized] = useState(false);

  // Uma resposta por pergunta; se o envio falhar (internet), libera para tentar de novo.
  const answerOnce = useCallback(
    async (optionId) => {
      if (answeredRef.current) return;
      answeredRef.current = true;
      const sent = await onAnswer(optionId);
      if (!sent) answeredRef.current = false;
      else if (optionId === "done") setRecognized(true);
    },
    [onAnswer],
  );

  const handleWrite = useCallback((label) => {
    if (sameLabel(label, target)) answerOnce("done");
  }, [target, answerOnce]);

  const translator = useSignTranslator({ samples, profile, sensitivity: "normal", onWrite: handleWrite });
  const camera = useHandCamera(translator.handleFrame, {
    // Palavras precisam do corpo (pose) e das duas mãos; letras só da mão (mais leve).
    detectBody: targetKind === "word",
    stillThreshold: SENSITIVITIES.normal.still,
    facingMode: "user",
  });
  const failed = camera.status === "error";

  return (
    <div className="camera-question">
      <div className="camera-question__target">
        {letterDrawing ? <HandDrawing points={letterDrawing} size={64} /> : <Icon name="hand" size={40} strokeWidth={1.6} />}
        <div>
          <span className="camera-question__label">{targetKind === "letter" ? "Letra" : "Sinal"}</span>
          <strong className="camera-question__word">{target}</strong>
        </div>
        {avatar && (
          <button type="button" className="camera-question__see" onClick={() => setShowingSign(true)}>
            <Icon name="replay" size={16} /> Ver o sinal
          </button>
        )}
      </div>

      <div className="camera-question__frame">
        <div className="camera-view camera-view--mirrored">
          <video ref={camera.videoRef} playsInline muted aria-label="Imagem da câmera" />
          <canvas ref={camera.canvasRef} aria-hidden="true" />
        </div>
        {camera.status !== "ready" && (
          <div className={`camera-question__cover${failed ? " camera-question__cover--error" : ""}`} role={failed ? "alert" : "status"}>
            <Icon name="camera" size={34} strokeWidth={1.4} />
            <p>{failed ? camera.error : camera.step}</p>
          </div>
        )}
        {recognized && <div className="camera-question__done" aria-hidden="true"><Icon name="check" size={46} strokeWidth={3} /></div>}
      </div>

      {!answered && (
        <>
          <p className="camera-question__status" role="status" aria-live="polite">
            {failed ? "Sem câmera, esta pergunta pode ser pulada sem perder ponto." : camera.status === "ready" ? describeProgress(translator, targetKind) : "Preparando…"}
          </p>
          <div className="camera-question__actions">
            {failed ? (
              <button type="button" className="button-primary" onClick={() => answerOnce("unavailable")}>Continuar sem câmera</button>
            ) : (
              <button type="button" className="camera-question__skip" onClick={() => answerOnce("skip")}>Pular esta</button>
            )}
          </div>
        </>
      )}

      {showingSign && <SignDialog word={target} avatar={avatar} onClose={() => setShowingSign(false)} />}
    </div>
  );
}
