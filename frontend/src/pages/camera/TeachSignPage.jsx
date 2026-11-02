import { useRef, useState } from "react";
import { Icon } from "../../components/Icon.jsx";
import { useSettings } from "../../context/SettingsContext.jsx";
import { useCountdown } from "../../hooks/useCountdown.js";
import { playAnswerFeedback } from "../../utils/feedback-effects.js";
import {
  adicionarAmostras as addOwnSamples,
  amostrasBase as readBaseSamples,
  amostrasProprias as readOwnSamples,
  contagem as countByLabel,
  exportarProprias as exportOwnSamples,
  importarProprias as importOwnSamples,
  removerRotulo as removeOwnLabel,
} from "../../features/translator/engine/classificador.js";
import {
  DetectorGesto as GestureDetector,
  MIN_AMOSTRAS as MIN_GESTURE_SAMPLES,
  adicionarGesto as addGesture,
  contagemGestos as countGestures,
  removerGestos as removeGestures,
} from "../../features/translator/engine/movimento.js";
import { lerPerfil as readHandProfile } from "../../features/translator/engine/perfil.js";
import { useHandCamera, DEFAULT_STILL_THRESHOLD } from "../../features/translator/useHandCamera.js";
import { MOVEMENT_LETTERS, buildGestureFrame } from "../../features/translator/useSignTranslator.js";
import { CameraToolLayout, RecordingBadge } from "./CameraToolLayout.jsx";
import "./camera.css";

const SAMPLES_PER_RECORDING = 30;
const GESTURE_REPETITIONS = 5;
const COUNTDOWN_SECONDS = 3;

const SIGN_TYPES = [
  { id: "static", label: "Sinal parado" },
  { id: "movement", label: "Com movimento" },
];

function downloadOwnSamples() {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([exportOwnSamples()], { type: "application/json" }));
  link.download = "signa-sinais.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function describeRecording(recording) {
  if (!recording) return "";
  if (recording.type === "movement") {
    return `Repetição ${recording.done + 1}/${GESTURE_REPETITIONS}: faça o gesto e pare a mão`;
  }
  return `Gravando… ${recording.samples.length}/${SAMPLES_PER_RECORDING}`;
}

function TaughtGestureList({ counts, onRemove }) {
  const entries = Object.entries(counts).sort();
  if (entries.length === 0) return null;
  return (
    <>
      <h3>Com movimento (suas gravações)</h3>
      <ul className="tool-list">
        {entries.map(([label, count]) => (
          <li key={label}>
            <b>{label}</b>
            <span>
              {count} repetições
              {count < MIN_GESTURE_SAMPLES ? ` — grave mais ${MIN_GESTURE_SAMPLES - count} para reconhecer` : ""}
            </span>
            <button type="button" className="icon-button" onClick={() => onRemove(label)} aria-label={`Apagar suas gravações de ${label}`}>
              <Icon name="close" size={16} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function StaticSampleList({ baseCounts, ownCounts, onRemove }) {
  const labels = [...new Set([...Object.keys(baseCounts), ...Object.keys(ownCounts)])].sort();
  return (
    <>
      <h3>Sinais parados</h3>
      <ul className="tool-list">
        {labels.map((label) => (
          <li key={label}>
            <b>{label}</b>
            <span>
              {[baseCounts[label] && `${baseCounts[label]} de referência`, ownCounts[label] && `${ownCounts[label]} suas`]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {ownCounts[label] ? (
              <button type="button" className="icon-button" onClick={() => onRemove(label)} aria-label={`Apagar suas amostras de ${label}`}>
                <Icon name="close" size={16} />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Ensinar sinal: grava amostras da própria pessoa. Parado = 30 quadros com a mão parada (k-NN);
 * com movimento (H, J, K, X, Z, Ç) = 5 repetições do gesto (DTW). Tudo fica neste aparelho.
 */
export default function TeachSignPage() {
  const { settings } = useSettings();
  const profile = readHandProfile();
  const [signType, setSignType] = useState("static");
  const [label, setLabel] = useState("");
  const [message, setMessage] = useState("");
  const [recording, setRecording] = useState(null); // {type:'static', samples[]} | {type:'movement', done, detector}
  const [gestureCounts, setGestureCounts] = useState(countGestures);
  const [ownCounts, setOwnCounts] = useState(() => countByLabel(readOwnSamples(profile?.escala)));
  const baseCounts = useRef(countByLabel(readBaseSamples())).current;
  const recordingRef = useRef(null);
  const fileInputRef = useRef(null);
  const countdown = useCountdown();

  const updateRecording = (value) => {
    recordingRef.current = value;
    setRecording(value ? { ...value, samples: value.samples ? [...value.samples] : undefined } : null);
  };
  const refreshOwnCounts = () => setOwnCounts(countByLabel(readOwnSamples(profile?.escala)));
  const celebrate = () => playAnswerFeedback(true, settings.soundsAndVibration);

  function recordGestureFrame(current, hand, points, video, info) {
    const frame = buildGestureFrame(hand, points, info, video.videoWidth / video.videoHeight, DEFAULT_STILL_THRESHOLD);
    const gesture = current.detector.push(frame);
    if (gesture?.curto) setMessage("Movimento curto demais — faça o gesto inteiro e pare a mão no fim.");
    if (!gesture || gesture.curto) return;

    addGesture(current.label, gesture.quadros);
    setGestureCounts(countGestures());
    celebrate();
    const done = current.done + 1;
    if (done >= GESTURE_REPETITIONS) {
      updateRecording(null);
      setMessage(`✅ ${GESTURE_REPETITIONS} repetições de "${current.label}" salvas neste aparelho. Já pode usar no tradutor.`);
      return;
    }
    updateRecording({ ...current, done });
    setMessage("");
  }

  function recordStaticFrame(current, points, info) {
    if (!points || !info.still) return;
    const samples = [...current.samples, points];
    if (samples.length < SAMPLES_PER_RECORDING) {
      updateRecording({ ...current, samples });
      return;
    }
    updateRecording(null);
    addOwnSamples(current.label, samples);
    refreshOwnCounts();
    celebrate();
    setMessage(`✅ ${SAMPLES_PER_RECORDING} amostras de "${current.label}" salvas neste aparelho.`);
  }

  const camera = useHandCamera((hand, points, video, info) => {
    const current = recordingRef.current;
    if (!current) return;
    if (current.type === "movement") recordGestureFrame(current, hand, points, video, info);
    else recordStaticFrame(current, points, info);
  });

  function startRecording() {
    const cleanLabel = label.trim().toUpperCase();
    if (!cleanLabel) {
      setMessage("Digite a letra ou o sinal que você vai fazer.");
      return;
    }
    setMessage("");
    countdown.start(COUNTDOWN_SECONDS, () => {
      updateRecording(
        signType === "movement"
          ? { type: "movement", label: cleanLabel, done: 0, detector: new GestureDetector() }
          : { type: "static", label: cleanLabel, samples: [] },
      );
    });
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setMessage(`✅ ${importOwnSamples(await file.text())} amostras importadas.`);
      refreshOwnCounts();
    } catch (importError) {
      setMessage(`Não foi possível importar: ${importError.message}`);
    }
    event.target.value = "";
  }

  const busy = Boolean(recording) || countdown.count != null;

  return (
    <CameraToolLayout
      title="Ensinar sinal"
      camera={camera}
      overlay={<RecordingBadge countdown={countdown.count} text={describeRecording(recording)} />}
    >
      <div className="segmented-dark" role="radiogroup" aria-label="Tipo de sinal">
        {SIGN_TYPES.map((type) => (
          <button key={type.id} type="button" role="radio" aria-checked={signType === type.id} disabled={busy} onClick={() => setSignType(type.id)}>
            {type.label}
          </button>
        ))}
      </div>
      <p className="tool-text">
        {signType === "static"
          ? `Faça a configuração de mão e segure parada: são gravadas ${SAMPLES_PER_RECORDING} amostras. Entre gravações, mude um pouco a distância e a inclinação.`
          : `Para letras como ${MOVEMENT_LETTERS.join(", ")}: comece com a mão parada, faça o gesto e pare a mão no fim. Grave ${GESTURE_REPETITIONS} repetições seguidas (no mínimo ${MIN_GESTURE_SAMPLES} para começar a reconhecer).`}
      </p>

      <div className="tool-row">
        <label className="field">
          <span className="visually-hidden">Sinal a ensinar</span>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value.slice(0, 20))}
            placeholder={signType === "static" ? "Letra ou palavra (ex.: D)" : "Letra com movimento (ex.: Z)"}
          />
        </label>
        <button type="button" className="button-primary" onClick={startRecording} disabled={busy || camera.status !== "ready"}>
          Gravar
        </button>
      </div>
      {message && <p className="tool-message" role="status">{message}</p>}

      <TaughtGestureList
        counts={gestureCounts}
        onRemove={(gestureLabel) => {
          removeGestures(gestureLabel);
          setGestureCounts(countGestures());
        }}
      />
      <StaticSampleList
        baseCounts={baseCounts}
        ownCounts={ownCounts}
        onRemove={(sampleLabel) => {
          removeOwnLabel(sampleLabel);
          refreshOwnCounts();
        }}
      />

      <div className="tool-actions">
        <button type="button" onClick={downloadOwnSamples} disabled={Object.keys(ownCounts).length === 0}>Exportar</button>
        <button type="button" onClick={() => fileInputRef.current.click()}>Importar</button>
        <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={importFile} />
      </div>
    </CameraToolLayout>
  );
}
