import { useEffect, useRef, useState } from "react";
import { CONEXOES as HAND_CONNECTIONS, SCORE_MINIMO as MIN_HAND_SCORE, maoPrincipal as findMainHand } from "./engine/maos.js";
import { criarDetector as createDetector } from "./engine/detectorRemoto.js";
import { pontosNormalizados as normalizePoints } from "./engine/classificador.js";
import { motivoImplausivel as findImplausibility, movimento as measureMovement } from "./engine/perfil.js";

/** Quadros seguidos com mão válida antes de considerá-la presente (filtra detecções relâmpago). */
const PRESENCE_FRAMES = 3;
/** Movimento médio da palma (palmas por quadro) abaixo do qual a mão é considerada parada. */
export const DEFAULT_STILL_THRESHOLD = 0.08;

const IS_MOBILE =
  typeof navigator !== "undefined" &&
  (navigator.userAgentData?.mobile ?? /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));
/** Celular: resolução menor (os modelos reduzem a imagem de qualquer jeito). */
const RESOLUTION = IS_MOBILE ? { width: { ideal: 480 }, height: { ideal: 360 } } : { width: { ideal: 640 }, height: { ideal: 480 } };

export const FINGER_COLORS = [
  { name: "Polegar", color: "#ff4d6d", points: [1, 2, 3, 4] },
  { name: "Indicador", color: "#ffa62b", points: [5, 6, 7, 8] },
  { name: "Médio", color: "#ffe14d", points: [9, 10, 11, 12] },
  { name: "Anelar", color: "#3ddc84", points: [13, 14, 15, 16] },
  { name: "Mínimo", color: "#4dabff", points: [17, 18, 19, 20] },
];
const BODY_CONNECTIONS = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16]];

const colorOfPoint = (index) => FINGER_COLORS.find((finger) => finger.points.includes(index))?.color ?? "#ffffff";

/**
 * Explica o erro da câmera em linguagem simples (sem detalhes técnicos).
 * @param {Error} error
 * @returns {string}
 */
export function describeCameraError(error) {
  switch (error?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Permita o acesso à câmera nas configurações do aparelho.";
    case "NotReadableError":
    case "AbortError":
      return "A câmera está sendo usada por outro programa ou aba. Feche-o e tente de novo.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "Nenhuma câmera foi encontrada.";
    default:
      return "Não foi possível abrir a câmera agora. Tente de novo em instantes.";
  }
}

/**
 * Desenha uma mão com cada dedo de uma cor. A mão principal (a que soletra) sai mais grossa.
 */
function drawHand(context, toCanvas, landmarks, main) {
  const points = landmarks.map(toCanvas);
  for (const [from, to] of HAND_CONNECTIONS) {
    const finger = FINGER_COLORS.find((item) => item.points.includes(from) && item.points.includes(to));
    context.strokeStyle = finger ? finger.color : "rgba(255,255,255,.85)";
    context.lineWidth = (finger ? 5 : 3) * (main ? 1 : 0.7);
    context.beginPath();
    context.moveTo(...points[from]);
    context.lineTo(...points[to]);
    context.stroke();
  }
  points.forEach(([x, y], index) => {
    context.fillStyle = colorOfPoint(index);
    context.strokeStyle = "rgba(0,0,0,.55)";
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(x, y, (index === 0 ? 7 : 5) * (main ? 1 : 0.75), 0, Math.PI * 2);
    context.fill();
    context.stroke();
  });
}

/**
 * Desenha o corpo e as mãos (a principal e a outra) sobre a imagem da câmera.
 */
function drawOverlay(canvas, video, hand, otherHands, pose) {
  if (!canvas) return;
  if (canvas.width !== video.videoWidth) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.lineCap = "round";
  const toCanvas = (point) => [point.x * canvas.width, point.y * canvas.height];

  if (pose) {
    context.strokeStyle = "rgba(255,255,255,.55)";
    context.lineWidth = 3;
    for (const [from, to] of BODY_CONNECTIONS) {
      context.beginPath();
      context.moveTo(...toCanvas(pose[from]));
      context.lineTo(...toCanvas(pose[to]));
      context.stroke();
    }
  }
  otherHands.forEach((landmarks) => drawHand(context, toCanvas, landmarks, false));
  if (hand) drawHand(context, toCanvas, hand.pontos, true);
}

/**
 * As outras mãos do quadro (além da principal) que passam pelos mesmos filtros: confiança mínima e formato de mão.
 * @returns {object[][]} pontos de cada mão.
 */
function findOtherHands(result, mainHand, aspect) {
  return (result.landmarks ?? []).filter((landmarks, index) => {
    if (mainHand && landmarks === mainHand.pontos) return false;
    const info = result.handedness?.[index]?.[0];
    if ((info?.score ?? 0) < MIN_HAND_SCORE) return false;
    const candidate = { pontos: landmarks, lado: info?.categoryName ?? "Right", score: info.score };
    return !findImplausibility(candidate, normalizePoints(landmarks, candidate.lado, aspect), aspect);
  });
}

/**
 * Corrige direita/esquerda na câmera traseira (o MediaPipe supõe imagem espelhada).
 */
function fixHandedness(hand, facingMode) {
  if (!hand || facingMode === "user") return hand;
  return { ...hand, lado: hand.lado === "Left" ? "Right" : "Left" };
}

/**
 * Abre a câmera com resolução menor no celular.
 * @param {"user"|"environment"} facingMode
 * @returns {Promise<MediaStream>}
 */
async function openCameraStream(facingMode) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Este navegador não dá acesso à câmera (abra por https ou localhost).");
  }
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode, ...RESOLUTION, frameRate: { ideal: 30 } },
    audio: false,
  });
}

/**
 * Câmera + detecção de mãos em loop (MediaPipe num Web Worker). Tudo roda no aparelho.
 * @param {(hand, points, video, info: {still: boolean, movement: number, body: object|null, handCount: number}) => void} onFrame
 *   chamado a cada quadro processado (hand/points = null sem mão válida; handCount = mãos na tela, 0 a 2).
 * @param {{detectBody?: boolean, stillThreshold?: number, facingMode?: "user"|"environment"}} [options]
 * @returns {{videoRef, canvasRef, status: "loading"|"ready"|"error", step: string, error: string}}
 * Usado por: CameraPage, TeachSignPage, HandAnalysisPage.
 */
export function useHandCamera(onFrame, { detectBody = false, stillThreshold = DEFAULT_STILL_THRESHOLD, facingMode = "user" } = {}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const thresholdRef = useRef(stillThreshold);
  thresholdRef.current = stillThreshold;

  const [status, setStatus] = useState("loading");
  const [step, setStep] = useState("Abrindo a câmera…");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let stream;
    let animationFrame;
    let detector = null;
    setStatus("loading");
    setStep("Abrindo a câmera…");

    async function start() {
      const openedStream = await openCameraStream(facingMode);
      // Em desenvolvimento o React monta duas vezes: fecha a câmera aberta à toa.
      if (!active) return openedStream.getTracks().forEach((track) => track.stop());
      stream = openedStream;
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();

      setStep("Preparando o reconhecimento das mãos…");
      // Na primeira vez o motor mede CPU e GPU do aparelho; o texto técnico dele não vai para a tela.
      const showFirstRunStep = () => setStep("Ajustando ao seu aparelho (só na primeira vez)…");
      detector = await createDetector({ corpo: detectBody, fonte: video, avisar: showFirstRunStep });
      if (!active) return detector.fechar();
      setStatus("ready");
      runDetectionLoop(video);
    }

    function runDetectionLoop(video) {
      let lastVideoTime = -1;
      let busy = false;
      let consecutiveFrames = 0;
      let previousPoints = null;
      const recentMovements = [];

      async function processFrame() {
        busy = true;
        try {
          lastVideoTime = video.currentTime;
          const detection = await detector.detectar(video);
          if (!active) return;
          const aspect = video.videoWidth / video.videoHeight;
          const body = detectBody ? { hands: detection.rm.landmarks ?? [], pose: detection.pose } : null;

          let hand = fixHandedness(findMainHand(detection.rm, MIN_HAND_SCORE), facingMode);
          let points = hand ? normalizePoints(hand.pontos, hand.lado, aspect) : null;
          if (hand && findImplausibility(hand, points, aspect)) {
            hand = null;
            points = null;
          }
          consecutiveFrames = hand ? consecutiveFrames + 1 : 0;
          if (consecutiveFrames < PRESENCE_FRAMES) {
            hand = null;
            points = null;
          }

          const movement = hand ? measureMovement(previousPoints, hand.pontos, aspect) : 0;
          previousPoints = hand ? hand.pontos : null;
          if (hand) {
            recentMovements.push(movement);
            if (recentMovements.length > 4) recentMovements.shift();
          } else {
            recentMovements.length = 0;
          }
          const averageMovement = recentMovements.length
            ? recentMovements.reduce((sum, value) => sum + value, 0) / recentMovements.length
            : 0;

          // A outra mão só aparece junto com a principal (o mesmo filtro de presença contínua vale para as duas).
          const otherHands = hand ? findOtherHands(detection.rm, hand, aspect) : [];
          drawOverlay(canvasRef.current, video, hand, otherHands, body?.pose ?? null);
          const still = Boolean(hand) && recentMovements.length >= 3 && averageMovement < thresholdRef.current;
          const bodyInfo = body
            ? { pose: body.pose, maos: body.hands, w: video.videoWidth, h: video.videoHeight, t: performance.now() / 1000 }
            : null;
          onFrameRef.current(hand, points, video, { still, movement: averageMovement, body: bodyInfo, handCount: hand ? 1 + otherHands.length : 0 });
        } catch (frameError) {
          if (active) console.warn("detecção falhou neste quadro:", frameError);
        } finally {
          busy = false;
        }
      }

      const loop = () => {
        if (!active) return;
        if (!busy && video.readyState >= 2 && video.currentTime !== lastVideoTime) processFrame();
        animationFrame = requestAnimationFrame(loop);
      };
      loop();
    }

    start().catch((startError) => {
      if (!active) return;
      console.warn("Câmera/detector indisponível:", startError);
      setStatus("error");
      setError(describeCameraError(startError));
    });

    return () => {
      active = false;
      cancelAnimationFrame(animationFrame);
      detector?.fechar();
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [detectBody, facingMode]);

  return { videoRef, canvasRef, status, step, error };
}
