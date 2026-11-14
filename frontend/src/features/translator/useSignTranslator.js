import { useCallback, useEffect, useRef, useState } from "react";
import { LIMIAR_DESCONHECIDO as UNKNOWN_THRESHOLD, caracteristicas as extractFeatures, classificar as classifyLetter } from "./engine/classificador.js";
import { acrescentar as appendLabel, estadoInicial as createSequenceState, processar as advanceSequence } from "./engine/escrita.js";
import { mediaVetores as averageVectors } from "./engine/perfil.js";
import { Extrator as BodyFeatureExtractor, Segmentador as SignSegmenter, carregarModelo as loadWordModel, classificarSinal as classifyWord } from "./engine/dinamicos.js";
import { DetectorGesto as GestureDetector, classificarGesto as classifyGesture, prepararGestos as prepareGestures } from "./engine/movimento.js";

/** Quadros recentes promediados antes de classificar (reduz tremores). */
const SMOOTHING_FRAMES = 5;
/** Palavra no lugar de letras soletradas no mesmo trecho: só com confiança alta. */
const WORD_OVER_LETTERS_CONFIDENCE = 0.85;
/** A mão precisa ficar parada esse tempo antes de uma letra contar; nada conta logo após um gesto. */
const LETTER_DELAY_SECONDS = 0.35;
const PAUSE_AFTER_GESTURE_SECONDS = 0.5;
const EVENT_DISPLAY_MS = 2500;
export const MOVEMENT_LETTERS = ["H", "J", "K", "X", "Z", "Ç"];

/** Quão parecido o gesto precisa estar, quão parada a mão e por quanto tempo. */
export const SENSITIVITIES = {
  strict: { label: "Rigorosa", threshold: 0.85, still: 0.05, stableFrames: 14, confidence: 0.65 },
  normal: { label: "Normal", threshold: 1, still: 0.08, stableFrames: 10, confidence: 0.55 },
  tolerant: { label: "Tolerante", threshold: 1.4, still: 0.14, stableFrames: 7, confidence: 0.45 },
};

/**
 * Quadro no formato do detector de gestos com movimento (punho espelhado como os pontos).
 * @returns {object|null}
 * Usado por: useSignTranslator e TeachSignPage (gravar letras com movimento).
 */
export function buildGestureFrame(hand, points, info, aspect, stillThreshold) {
  if (!hand) return null;
  const side = hand.lado === "Left" ? -1 : 1;
  return {
    t: performance.now() / 1000,
    pontos: points,
    punho: [side * hand.pontos[0].x * aspect, hand.pontos[0].y],
    movendo: info.movement > stillThreshold * 1.2,
    parada: info.still,
  };
}

/**
 * Tradução em tempo real: letras paradas (k-NN), letras com movimento ensinadas (DTW) e palavras (LSTM).
 * @param {{samples: object[], profile: object|null, sensitivity: "strict"|"normal"|"tolerant", onWrite?: (label: string) => void}} options
 *   onWrite é chamado a cada letra/palavra reconhecida.
 * @returns {{handleFrame, text, textActions, currentLetter, handState, isGestureActive, event, wordModel,
 *   wordModelError, taughtGestureLetters, builtInGestureLetters, stillThreshold}}
 * Usado por: CameraPage. onWrite é o gancho natural para conquistas do tradutor (ex.: "Soletre 10 letras").
 */
export function useSignTranslator({ samples, profile, sensitivity, onWrite }) {
  const settings = SENSITIVITIES[sensitivity];
  const [text, setTextState] = useState("");
  const textRef = useRef("");
  const [currentLetter, setCurrentLetter] = useState(null);
  const [handState, setHandState] = useState("none"); // none | moving | still
  const [event, setEvent] = useState(null);
  const [wordModel, setWordModel] = useState(null);
  const [wordModelError, setWordModelError] = useState("");

  const refs = useRef({
    gestures: prepareGestures(),
    sequence: createSequenceState(),
    window: [],
    movingFrames: 0,
    gestureDetector: new GestureDetector(),
    blockStaticLetter: false,
    extractor: new BodyFeatureExtractor(),
    segmenter: new SignSegmenter(),
    segmentStart: null,
    stillSince: null,
    lastLetterKey: "",
  });
  const onWriteRef = useRef(onWrite);
  onWriteRef.current = onWrite;

  const setText = useCallback((update) => {
    textRef.current = typeof update === "function" ? update(textRef.current) : update;
    setTextState(textRef.current);
  }, []);

  useEffect(() => {
    loadWordModel().then(setWordModel).catch((error) => setWordModelError(error.message));
  }, []);

  useEffect(() => {
    if (!event) return undefined;
    const timer = setTimeout(() => setEvent(null), EVENT_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [event]);

  /** Só re-renderiza quando o resultado muda (renderizar a cada quadro deixava tudo lento). */
  const showLetter = useCallback((result) => {
    const key = result ? `${result.rotulo}|${Math.round((result.confianca ?? 0) * 20)}|${result.maisParecido}` : "";
    if (key === refs.current.lastLetterKey) return;
    refs.current.lastLetterKey = key;
    setCurrentLetter(result);
  }, []);

  const write = useCallback(
    (label) => {
      setText((current) => appendLabel(current, label));
      onWriteRef.current?.(label);
    },
    [setText],
  );

  const recognizeWord = useCallback(
    (info) => {
      const state = refs.current;
      if (!wordModel || !info.body) return;
      const { pose, maos, w, h, t } = info.body;
      const wasActive = state.segmenter.ativo;
      const segment = state.segmenter.push({ ...state.extractor.quadro(pose, maos, w, h), t });
      if (!wasActive && state.segmenter.ativo) state.segmentStart = textRef.current.length;

      if (segment && !segment.curto) {
        const result = classifyWord(wordModel, segment);
        const start = Math.min(state.segmentStart ?? textRef.current.length, textRef.current.length);
        const lettersInSegment = textRef.current.length > start;
        const required = lettersInSegment ? Math.max(WORD_OVER_LETTERS_CONFIDENCE, result.limiar) : result.limiar;
        if (result.confianca >= required) {
          setText((current) => appendLabel(current.slice(0, start), result.palavra));
          onWriteRef.current?.(result.palavra);
          setEvent({ type: "word", text: result.palavra, confidence: result.confianca, experimental: result.experimental });
        } else if (!lettersInSegment) {
          setEvent({ type: "info", text: `Sinal não reconhecido (parece ${result.maisParecido})` });
        }
      }
      if (segment) state.segmentStart = null;
    },
    [wordModel, setText],
  );

  const recognizeGestureLetter = useCallback(
    (hand, points, info, aspect) => {
      const state = refs.current;
      const frame = buildGestureFrame(hand, points, info, aspect, settings.still);
      const wasActive = state.gestureDetector.ativo;
      const gesture = state.gestureDetector.push(frame);
      if ((!wasActive && state.gestureDetector.ativo) || !hand) state.blockStaticLetter = false;
      if (!gesture || gesture.curto) return;

      const result = classifyGesture(state.gestures, gesture);
      if (result?.rotulo) {
        write(result.rotulo);
        state.blockStaticLetter = true; // a posição final do gesto não vira outra letra
        state.sequence = createSequenceState();
        setEvent({ type: "gesture", text: result.rotulo });
      }
    },
    [settings.still, write],
  );

  const recognizeStaticLetter = useCallback(
    (hand, points, info) => {
      const state = refs.current;
      const now = performance.now() / 1000;
      state.stillSince = hand && info.still ? state.stillSince ?? now : null;
      const waiting =
        hand &&
        info.still &&
        (now - state.stillSince < LETTER_DELAY_SECONDS ||
          state.gestureDetector.ativo ||
          now - state.gestureDetector.fim < PAUSE_AFTER_GESTURE_SECONDS ||
          (info.body?.maos.length ?? 0) >= 2);

      state.movingFrames = hand && !info.still ? state.movingFrames + 1 : 0;
      // Mexeu a mão por ~0,2 s: a mesma letra pode ser escrita de novo (ex.: "OO").
      if (state.movingFrames >= 6) state.sequence = { ...state.sequence, travado: null };

      if (hand && (!info.still || waiting)) {
        state.window = [];
        setHandState("moving");
        showLetter(null);
        state.sequence = advanceSequence(state.sequence, { rotulo: null, confianca: 0 }).estado;
        return;
      }

      if (points) {
        state.window.push(extractFeatures(points, profile?.escala));
        if (state.window.length > SMOOTHING_FRAMES) state.window.shift();
      } else {
        state.window = [];
      }
      const result = points
        ? classifyLetter(averageVectors(state.window), samples, 5, UNKNOWN_THRESHOLD * settings.threshold)
        : null;
      setHandState(hand ? "still" : "none");
      showLetter(result);
      const { estado, escrever: letter } = advanceSequence(state.sequence, result, settings.stableFrames, settings.confidence);
      state.sequence = estado;
      if (letter && !state.blockStaticLetter) write(letter);
    },
    [profile, samples, settings, showLetter, write],
  );

  const handleFrame = useCallback(
    (hand, points, video, info) => {
      const aspect = video.videoWidth / video.videoHeight;
      recognizeWord(info);
      recognizeGestureLetter(hand, points, info, aspect);
      recognizeStaticLetter(hand, points, info);
    },
    [recognizeWord, recognizeGestureLetter, recognizeStaticLetter],
  );

  const textActions = {
    addSpace: () => setText((current) => (current.endsWith(" ") || !current ? current : `${current} `)),
    deleteLast: () => setText((current) => current.replace(/\s+$/, "").slice(0, -1)),
    clear: () => setText(""),
    speak: () => {
      if (!textRef.current.trim() || !("speechSynthesis" in window)) return;
      const utterance = new SpeechSynthesisUtterance(textRef.current.toLowerCase());
      utterance.lang = "pt-BR";
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    },
  };

  return {
    handleFrame,
    text,
    textActions,
    currentLetter,
    handState,
    isGestureActive: () => refs.current.gestureDetector.ativo,
    event,
    wordModel,
    wordModelError,
    taughtGestureLetters: refs.current.gestures.filter((gesture) => !gesture.base).map((gesture) => gesture.r),
    builtInGestureLetters: refs.current.gestures.filter((gesture) => gesture.base).map((gesture) => gesture.r),
    stillThreshold: settings.still,
  };
}
