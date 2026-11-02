import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSettings } from "../../context/SettingsContext.jsx";
import { useCountdown } from "../../hooks/useCountdown.js";
import { playAnswerFeedback } from "../../utils/feedback-effects.js";
import { markHandAnalysisSeen } from "../../features/translator/translator-preferences.js";
import {
  adicionarAmostras as addOwnSamples,
  amostrasBase as readBaseSamples,
  amostrasProprias as readOwnSamples,
  caracteristicas as extractFeatures,
  classificar as classifyLetter,
  removerCalibracao as removeCalibrationSamples,
} from "../../features/translator/engine/classificador.js";
import {
  LETRAS_AJUSTE as ADJUSTMENT_LETTERS,
  NOMES_DEDOS as FINGER_NAMES,
  analisarProporcoes as analyzeProportions,
  brilho as measureBrightness,
  caixaMao as measureHandBox,
  maoAberta as isHandOpen,
  maoReal as describeRealHand,
  salvarPerfil as saveHandProfile,
} from "../../features/translator/engine/perfil.js";
import { useHandCamera } from "../../features/translator/useHandCamera.js";
import { CameraToolLayout, RecordingBadge } from "./CameraToolLayout.jsx";
import "./camera.css";

const ENVIRONMENT_WINDOW = 45; // ~1,5 s de quadros para avaliar o ambiente
const OPEN_HAND_FRAMES = 30;
const LETTER_FRAMES = 20;
const LETTER_TRAIN_FRAMES = 15; // o resto dos quadros de cada letra serve de teste no resumo
const COUNTDOWN_SECONDS = 2;
const STEPS = [
  { id: "environment", label: "Ambiente" },
  { id: "openHand", label: "Mão aberta" },
  { id: "letters", label: "Letras" },
  { id: "summary", label: "Pronto" },
];

const average = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

function mostFrequent(values) {
  const counts = {};
  for (const value of values) if (value) counts[value] = (counts[value] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function describeLight(light) {
  if (light == null) return { ok: false, hint: "medindo…" };
  if (light <= 60) return { ok: false, hint: "Ambiente escuro: acenda uma luz de frente para você." };
  if (light >= 225) return { ok: false, hint: "Luz forte demais ou contra a câmera." };
  return { ok: true, hint: "boa" };
}

function describeDistance(detected, size) {
  if (!detected) return { ok: false, hint: "—" };
  if (size < 0.2) return { ok: false, hint: "Aproxime a mão da câmera." };
  if (size > 0.65) return { ok: false, hint: "Afaste um pouco a mão." };
  return { ok: true, hint: "boa" };
}

/** Confere luz, mão visível, distância e enquadramento nos últimos quadros. */
function evaluateEnvironment(history) {
  const detected = history.filter((frame) => frame.hasHand);
  const detectionRate = detected.length / (history.length || 1);
  const size = average(detected.map((frame) => frame.tamanho)) ?? 0;
  const centerX = average(detected.map((frame) => frame.cx)) ?? 0.5;
  const centerY = average(detected.map((frame) => frame.cy)) ?? 0.5;
  const light = average(history.filter((frame) => frame.light != null).map((frame) => frame.light));
  const centered = detected.length > 0 && Math.abs(centerX - 0.5) < 0.3 && Math.abs(centerY - 0.5) < 0.3;

  return [
    { id: "light", label: "Iluminação", ...describeLight(light) },
    { id: "hand", label: "Mão visível", ok: detectionRate >= 0.8, hint: detectionRate >= 0.8 ? "detectada" : "Mostre a mão inteira, com o punho aparecendo." },
    { id: "distance", label: "Distância", ...describeDistance(detected.length > 0, size) },
    { id: "framing", label: "Enquadramento", ok: centered, hint: !detected.length ? "—" : centered ? "centralizada" : "Leve a mão para o centro da imagem." },
  ];
}

/** "Depois do ajuste": treina com os primeiros quadros de cada letra e testa nos últimos. */
function measureAccuracyAfterAdjustment(referenceSamples, recordedLetters, scale) {
  const training = referenceSamples.concat(
    recordedLetters.flatMap(([letter, data]) =>
      data.points.slice(0, LETTER_TRAIN_FRAMES).map((points) => ({ rotulo: letter, origem: "calibracao", v: extractFeatures(points, scale) })),
    ),
  );
  let hits = 0;
  let tests = 0;
  for (const [letter, data] of recordedLetters) {
    for (const points of data.points.slice(LETTER_TRAIN_FRAMES)) {
      tests += 1;
      if (classifyLetter(extractFeatures(points, scale), training).rotulo === letter) hits += 1;
    }
  }
  return tests ? Math.round((hits / tests) * 100) : null;
}

function StepIndicator({ current }) {
  const currentIndex = STEPS.findIndex((step) => step.id === current);
  return (
    <ol className="tool-steps" aria-label="Etapas">
      {STEPS.map((step, index) => (
        <li
          key={step.id}
          className={index < currentIndex ? "tool-steps__done" : index === currentIndex ? "tool-steps__current" : ""}
          aria-current={index === currentIndex ? "step" : undefined}
        >
          {step.label}
        </li>
      ))}
    </ol>
  );
}

function SummaryList({ summary }) {
  const { profile } = summary;
  return (
    <ul className="check-list">
      {profile.mao && <li><span>✋</span>Mão analisada: <b>{profile.mao}</b></li>}
      {profile.relativo && (
        <li>
          <span>📏</span>
          Dedos em relação à média:{" "}
          {profile.relativo.map((ratio, index) => `${FINGER_NAMES[index]} ${ratio >= 1 ? "+" : ""}${Math.round((ratio - 1) * 100)}%`).join(" · ")}
        </li>
      )}
      <li><span>🔤</span>Letras gravadas: <b>{summary.total}</b></li>
      {summary.total > 0 && <li><span>📉</span>Antes do ajuste: <b>{summary.before} de {summary.total}</b> letras certas na sua mão.</li>}
      {summary.after != null && <li><span>📈</span>Depois do ajuste: <b>{summary.after}%</b> de acerto nos quadros de teste.</li>}
    </ul>
  );
}

/**
 * Análise da mão: confere o ambiente, mede as proporções dos dedos (mão aberta) e grava as letras
 * que o app mais confunde (M/N/Q, P, R/U, T, E) feitas pela própria pessoa. Tudo fica no aparelho.
 */
export default function HandAnalysisPage() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [step, setStep] = useState("intro");
  const [checks, setChecks] = useState(() => evaluateEnvironment([]));
  const [openHandCount, setOpenHandCount] = useState(0);
  const [proportions, setProportions] = useState(null); // {relativo, escala, mao}
  const [letterIndex, setLetterIndex] = useState(0);
  const [seenLetter, setSeenLetter] = useState(null);
  const [recordedCount, setRecordedCount] = useState(null);
  const [summary, setSummary] = useState(null);
  const countdown = useCountdown();

  const stepRef = useRef(step);
  stepRef.current = step;
  const letterIndexRef = useRef(letterIndex);
  letterIndexRef.current = letterIndex;
  const state = useRef({
    frame: 0,
    environment: [],
    openHand: { points: [], sides: [] },
    recentLabels: [],
    capture: null, // {letter, points[]}
    letters: {}, // letra → {points, before}
    reference: null,
    scale: null,
  });
  state.current.reference ??= readBaseSamples().concat(readOwnSamples().filter((sample) => sample.origem !== "calibracao"));

  const celebrate = () => playAnswerFeedback(true, settings.soundsAndVibration);
  const currentLetter = ADJUSTMENT_LETTERS[letterIndex];

  function trackEnvironment(hand, video) {
    const data = state.current;
    const box = hand ? measureHandBox(hand) : null;
    data.environment.push({ hasHand: Boolean(hand), ...box, light: data.frame % 10 === 0 ? measureBrightness(video) : null });
    if (data.environment.length > ENVIRONMENT_WINDOW) data.environment.shift();
    if (data.frame % 5 === 0) setChecks(evaluateEnvironment(data.environment));
  }

  function collectOpenHand(hand, points, info) {
    const openHand = state.current.openHand;
    if (!hand || !info.still || !isHandOpen(hand)) return;
    openHand.points.push(points);
    openHand.sides.push(hand.lado);
    setOpenHandCount(openHand.points.length);
    if (openHand.points.length < OPEN_HAND_FRAMES) return;

    const analysis = analyzeProportions(openHand.points);
    state.current.scale = analysis.escala;
    setProportions({ ...analysis, mao: describeRealHand(mostFrequent(openHand.sides)) });
    celebrate();
    setStep("letters");
  }

  function collectLetter(points, info) {
    const data = state.current;
    if (data.capture) {
      if (!points || !info.still) return;
      data.capture.points.push(points);
      setRecordedCount(data.capture.points.length);
      if (data.capture.points.length < LETTER_FRAMES) return;
      const { letter, points: letterPoints } = data.capture;
      data.letters[letter] = { points: letterPoints, before: mostFrequent(data.recentLabels) };
      data.capture = null;
      setRecordedCount(null);
      celebrate();
      goToNextLetter();
      return;
    }
    const result = points ? classifyLetter(extractFeatures(points, data.scale), data.reference) : null;
    data.recentLabels.push(result?.rotulo ?? null);
    if (data.recentLabels.length > 15) data.recentLabels.shift();
    if (data.frame % 4 === 0) setSeenLetter(result?.rotulo ?? (points ? "?" : null));
  }

  const camera = useHandCamera((hand, points, video, info) => {
    state.current.frame += 1;
    if (stepRef.current === "environment") trackEnvironment(hand, video);
    else if (stepRef.current === "openHand") collectOpenHand(hand, points, info);
    else if (stepRef.current === "letters") collectLetter(points, info);
  });

  function goToNextLetter() {
    state.current.recentLabels = [];
    setSeenLetter(null);
    const nextIndex = letterIndexRef.current + 1;
    if (nextIndex >= ADJUSTMENT_LETTERS.length) {
      finishAnalysis();
      return;
    }
    letterIndexRef.current = nextIndex;
    setLetterIndex(nextIndex);
  }

  function recordLetter() {
    const letter = currentLetter;
    countdown.start(COUNTDOWN_SECONDS, () => {
      state.current.capture = { letter, points: [] };
      setRecordedCount(0);
    });
  }

  function finishAnalysis() {
    const data = state.current;
    const scale = data.scale ?? [1, 1, 1, 1, 1];
    const recordedLetters = Object.entries(data.letters);
    const after = measureAccuracyAfterAdjustment(data.reference, recordedLetters, scale);

    removeCalibrationSamples();
    for (const [letter, letterData] of recordedLetters) addOwnSamples(letter, letterData.points, { cal: true });
    const profile = {
      criadoEm: new Date().toISOString(),
      mao: proportions?.mao ?? null,
      relativo: proportions?.relativo ?? null,
      escala: scale,
      letras: recordedLetters.map(([letter, letterData]) => ({ letra: letter, antes: letterData.before })),
    };
    saveHandProfile(profile);
    markHandAnalysisSeen();
    setSummary({
      profile,
      before: recordedLetters.filter(([letter, letterData]) => letterData.before === letter).length,
      total: recordedLetters.length,
      after,
    });
    setStep("summary");
  }

  function skipAnalysis() {
    markHandAnalysisSeen();
    navigate("/camera", { replace: true });
  }

  const environmentOk = checks.every((check) => check.ok);
  const busy = recordedCount != null || countdown.count != null;

  const overlay = (
    <>
      {step === "letters" && camera.status === "ready" && (
        <>
          <span className="big-letter">{currentLetter}</span>
          {!busy && <p className="camera-hint">{seenLetter ? `O app vê agora: ${seenLetter}` : "Mostre a mão"}</p>}
        </>
      )}
      {step === "openHand" && camera.status === "ready" && (
        <p className="camera-hint">Mão aberta, dedos esticados, palma para a câmera · {openHandCount}/{OPEN_HAND_FRAMES}</p>
      )}
      <RecordingBadge countdown={countdown.count} text={recordedCount != null ? `Gravando ${recordedCount}/${LETTER_FRAMES}…` : ""} />
    </>
  );

  return (
    <CameraToolLayout title="Análise da mão" camera={camera} overlay={overlay}>
      {step !== "intro" && <StepIndicator current={step} />}

      {step === "intro" && (
        <>
          <h2>Vamos analisar a sua mão</h2>
          <p className="tool-text">
            Leva cerca de 1 minuto. O app confere a luz e o enquadramento, mede as proporções dos seus dedos e grava
            algumas letras feitas por você. Assim ele passa a reconhecer a sua mão, e não só as fotos de referência.
            Tudo fica neste aparelho.
          </p>
          <button type="button" className="button-primary" onClick={() => setStep("environment")}>Começar análise</button>
          <button type="button" className="button-link" onClick={skipAnalysis}>Pular por agora</button>
        </>
      )}

      {step === "environment" && (
        <>
          <h2>1. Ambiente e enquadramento</h2>
          <p className="tool-text">Mostre uma mão para a câmera e mantenha-a no centro.</p>
          <ul className="check-list">
            {checks.map((check) => (
              <li key={check.id}>
                <span aria-hidden="true">{check.ok ? "✅" : "⏳"}</span>
                <b>{check.label}</b>
                <small>{check.hint}</small>
              </li>
            ))}
          </ul>
          <button type="button" className="button-primary" onClick={() => setStep("openHand")} disabled={!environmentOk}>Continuar</button>
          {!environmentOk && <button type="button" className="button-link" onClick={() => setStep("openHand")}>Continuar mesmo assim</button>}
        </>
      )}

      {step === "openHand" && (
        <>
          <h2>2. Mão aberta</h2>
          <p className="tool-text">
            Abra a mão que você usa para sinalizar, com os dedos esticados, e segure parada. Isso mede o tamanho dos seus
            dedos em relação à palma.
          </p>
          <div className="tool-progress" role="progressbar" aria-valuemin={0} aria-valuemax={OPEN_HAND_FRAMES} aria-valuenow={openHandCount}>
            <div style={{ transform: `scaleX(${openHandCount / OPEN_HAND_FRAMES})` }} />
          </div>
        </>
      )}

      {step === "letters" && (
        <>
          <h2>3. Letras de ajuste ({letterIndex + 1}/{ADJUSTMENT_LETTERS.length})</h2>
          <p className="tool-text">
            Faça a letra <b>{currentLetter}</b> em Libras, toque em Gravar e segure a mão parada (só quadros com a mão parada
            são gravados). São as letras que o app mais erra (M/N/Q, P, R/U, T, E).
          </p>
          <div className="tool-actions">
            <button type="button" className="tool-actions__primary" onClick={recordLetter} disabled={busy || camera.status !== "ready"}>
              Gravar {currentLetter}
            </button>
            <button type="button" onClick={goToNextLetter} disabled={busy}>Pular letra</button>
            <button type="button" onClick={finishAnalysis} disabled={busy}>Terminar</button>
          </div>
        </>
      )}

      {step === "summary" && summary && (
        <>
          <h2>Análise concluída ✅</h2>
          <SummaryList summary={summary} />
          <button type="button" className="button-primary" onClick={() => navigate("/camera", { replace: true })}>Começar a traduzir</button>
        </>
      )}
    </CameraToolLayout>
  );
}
