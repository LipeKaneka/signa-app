import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTrackOnMount } from "../../features/achievements/AppEventsContext.jsx";
import { Navigate, useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon.jsx";
import { HandDrawing } from "../../components/illustrations.jsx";
import { useSettings } from "../../context/SettingsContext.jsx";
import { playAnswerFeedback } from "../../utils/feedback-effects.js";
import { readPreference, storePreference } from "../../utils/session-storage.js";
import { amostrasBase as readBaseSamples, todasAmostras as readAllSamples } from "../../features/translator/engine/classificador.js";
import { lerPerfil as readHandProfile } from "../../features/translator/engine/perfil.js";
import { useHandCamera } from "../../features/translator/useHandCamera.js";
import { SENSITIVITIES, useSignTranslator } from "../../features/translator/useSignTranslator.js";
import { wasHandAnalysisSeen } from "../../features/translator/translator-preferences.js";
import { TranslatorDrawer } from "./TranslatorDrawer.jsx";
import { CameraStatusCover } from "./CameraStatusCover.jsx";
import "./camera.css";

const NEXT_TARGET_DELAY_MS = 1200;

/** Letras paradas com amostra de referência (o desenho da mão vem da própria amostra). */
function buildPracticeLetters() {
  const firstSampleByLetter = new Map();
  for (const sample of readBaseSamples()) {
    if (!firstSampleByLetter.has(sample.rotulo)) firstSampleByLetter.set(sample.rotulo, sample.p);
  }
  return [...firstSampleByLetter.entries()].map(([letter, points]) => ({ letter, points }));
}

function pickRandomTarget(letters, previous) {
  const options = letters.filter((item) => item.letter !== previous?.letter);
  return options[Math.floor(Math.random() * options.length)];
}

function describeTranslatorStatus(translator) {
  const { event, handState, currentLetter } = translator;
  if (event?.type === "word" || event?.type === "gesture") return { strong: event.text };
  if (event) return { text: event.text };
  if (handState === "none") return { text: "Mostre a mão para soletrar ou faça um sinal começando com as mãos abaixadas" };
  if (handState === "moving") return { text: translator.isGestureActive() ? "Termine o gesto e pare a mão" : "Segure a mão parada…" };
  if (currentLetter?.rotulo) return { strong: currentLetter.rotulo, confidence: currentLetter.confianca };
  return { text: "Mão detectada, sinal não reconhecido" };
}

function CornerBrackets() {
  return (
    <div className="camera-brackets" aria-hidden="true">
      <span /><span /><span /><span />
    </div>
  );
}

function PracticeCard({ target, success }) {
  return (
    <div className={`practice-card${success ? " practice-card--success" : ""}`} aria-live="polite">
      <HandDrawing points={target.points} size={88} />
      <strong>{target.letter}</strong>
      {success && <span className="practice-card__success">Boa!</span>}
    </div>
  );
}

function CameraScreen() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [facingMode, setFacingMode] = useState("user");
  const [mode, setMode] = useState("translate"); // translate | practice
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sensitivity, setSensitivityState] = useState(() => readPreference("translator-sensitivity", "normal"));
  const profile = useMemo(() => readHandProfile(), []);
  const samples = useMemo(() => readAllSamples(profile?.escala), [profile]);
  const practiceLetters = useMemo(buildPracticeLetters, []);
  const [target, setTarget] = useState(() => pickRandomTarget(practiceLetters));
  const [practiceSuccess, setPracticeSuccess] = useState(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const targetRef = useRef(target);
  targetRef.current = target;
  const nextTargetTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(nextTargetTimerRef.current), []);

  const setSensitivity = (value) => {
    setSensitivityState(value);
    storePreference("translator-sensitivity", value);
  };

  const handleWrite = useCallback(
    (label) => {
      if (modeRef.current !== "practice" || label !== targetRef.current?.letter) return;
      setPracticeSuccess(true);
      playAnswerFeedback(true, settings.soundsAndVibration);
      clearTimeout(nextTargetTimerRef.current);
      nextTargetTimerRef.current = setTimeout(() => {
        setPracticeSuccess(false);
        setTarget((current) => pickRandomTarget(practiceLetters, current));
      }, NEXT_TARGET_DELAY_MS);
    },
    [practiceLetters, settings.soundsAndVibration],
  );

  const translator = useSignTranslator({ samples, profile, sensitivity, onWrite: handleWrite });
  const camera = useHandCamera(translator.handleFrame, {
    detectBody: mode === "translate",
    stillThreshold: SENSITIVITIES[sensitivity].still,
    facingMode,
  });

  const status = describeTranslatorStatus(translator);
  const mirrored = facingMode === "user";

  return (
    <div className="camera-screen">
      <header className="camera-header">
        <button type="button" className="icon-button" onClick={() => navigate(-1)} aria-label="Voltar">
          <Icon name="back" size={26} strokeWidth={2.2} />
        </button>
        <h1 className="camera-header__title">Câmera</h1>
      </header>

      <div className={`camera-view${mirrored ? " camera-view--mirrored" : ""}`}>
        <video ref={camera.videoRef} playsInline muted aria-label="Imagem da câmera" />
        <canvas ref={camera.canvasRef} aria-hidden="true" />
      </div>
      {camera.status !== "ready" && <CameraStatusCover camera={camera} />}

      <main className="camera-stage">
        {mode === "practice" && <h2 className="camera-stage__heading">Faça o gesto abaixo</h2>}
        {mode === "translate" && camera.status === "ready" && (
          <p className="camera-status" role="status" aria-live="polite">
            {status.strong ? <strong>{status.strong}</strong> : status.text}
            {status.confidence ? <small> {Math.round(status.confidence * 100)}%</small> : null}
          </p>
        )}
        <CornerBrackets />
        {mode === "practice" && target && <PracticeCard target={target} success={practiceSuccess} />}
        {mode === "translate" && translator.text && <p className="camera-text">{translator.text}</p>}
      </main>

      <button type="button" className="camera-drawer-toggle" onClick={() => setDrawerOpen(true)} aria-label="Abrir opções do tradutor">
        <svg width="22" height="34" viewBox="0 0 22 34" aria-hidden="true"><path d="M20 2 L3 17 L20 32 Z" fill="#fff" /></svg>
      </button>

      <button
        type="button"
        className="camera-flip"
        onClick={() => setFacingMode((current) => (current === "user" ? "environment" : "user"))}
        aria-label={mirrored ? "Usar a câmera traseira" : "Usar a câmera frontal"}
      >
        <Icon name="flipCamera" size={34} strokeWidth={1.4} />
      </button>

      {drawerOpen && (
        <TranslatorDrawer
          mode={mode}
          onModeChange={setMode}
          sensitivity={sensitivity}
          onSensitivityChange={setSensitivity}
          translator={translator}
          samples={samples}
          profile={profile}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}

/** Na primeira vez, antes de traduzir, abre a análise da mão (pode ser pulada). */
export default function CameraPage() {
  useTrackOnMount("camera_open");
  if (!readHandProfile() && !wasHandAnalysisSeen()) return <Navigate to="/camera/analise" replace />;
  return <CameraScreen />;
}
