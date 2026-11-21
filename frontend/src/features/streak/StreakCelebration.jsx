import { useEffect, useRef, useState } from "react";
import fireFrame1 from "../../assets/elements/fogo-quadro-1.webp";
import fireFrame2 from "../../assets/elements/fogo-quadro-2.webp";
import fireFrame3 from "../../assets/elements/fogo-quadro-3.webp";
import fireFrame4 from "../../assets/elements/fogo-quadro-4.webp";
import fireFrame5 from "../../assets/elements/fogo-quadro-5.webp";
import fireFrame6 from "../../assets/elements/fogo-quadro-6.webp";
import { useSettings } from "../../context/SettingsContext.jsx";
import { playCelebrationFeedback } from "../../utils/feedback-effects.js";
import { prefersReducedMotion } from "../../utils/motion.js";
import "./streak-celebration.css";

/**
 * Tempos da entrada (ms), tirados do projeto do Alight Motion ("Novo projeto 2"): número antigo cai até 690; troca
 * para o novo e treme em 775; "Aumentada" em 783. A saída (faixa roxa subindo) só começa quando a pessoa toca.
 */
const SWAP_AT = 770;
const SHAKE_AT = 775;
const SHAKE_END = 2015;
const SHAKE_FREQ_END = 1125;
/** Tremor: 175 px no vídeo de 1080 px de largura → proporcional à tela (limitado em telas largas, como tablet). */
const SHAKE_MAGNITUDE = 175 / 1080;
const SHAKE_MAX_WIDTH = 480;
const SHAKE_FREQUENCY = 16;

/** Curva "ease-out" do Alight (cubicBezier 0 0.34 0.1 1) aproximada: rápida no começo, assenta no fim. */
const easeOut = (t) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);

/** Quadros do fogo (arte do projeto) e a ordem em que passam: vai e volta, 70 ms cada (como no Alight). */
const FIRE_FRAMES = [fireFrame1, fireFrame2, fireFrame3, fireFrame4, fireFrame5, fireFrame6];
const FIRE_SEQUENCE = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1];
const FIRE_FRAME_MS = 70;

/**
 * Fogo animado quadro a quadro. Todos os quadros ficam carregados e empilhados; só o atual aparece (sem piscar).
 * Com "menos movimento", fica parado no primeiro quadro.
 */
function AnimatedFire({ still }) {
  const containerRef = useRef(null);
  // Troca a opacidade direto nas imagens: antes era um setState a cada 70 ms (~48 redesenhos por animação).
  useEffect(() => {
    if (still) return undefined;
    const images = containerRef.current?.children ?? [];
    let step = 0;
    const timer = setInterval(() => {
      const previous = FIRE_SEQUENCE[step];
      step = (step + 1) % FIRE_SEQUENCE.length;
      images[previous].style.opacity = "0";
      images[FIRE_SEQUENCE[step]].style.opacity = "1";
    }, FIRE_FRAME_MS);
    return () => clearInterval(timer);
  }, [still]);
  return (
    <span className="streak-fire" aria-hidden="true" ref={containerRef}>
      {FIRE_FRAMES.map((frame, index) => (
        <img key={frame} src={frame} alt="" style={{ opacity: index === FIRE_SEQUENCE[0] ? 1 : 0 }} />
      ))}
    </span>
  );
}

/**
 * Tremor diagonal (45°) que diminui até parar, igual ao efeito "shake" do projeto: a força cai de 175 a 0 entre
 * 775 e 2015 ms e a frequência de 16 a 0 entre 775 e 1125 ms. Mexe direto no elemento (sem re-render a cada quadro).
 */
function useDiagonalShake(ref, enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    let frame = 0;
    let phase = 0;
    let last = null;
    const start = performance.now();
    const tick = (now) => {
      const elapsed = now - start;
      const element = ref.current;
      if (!element) return;
      if (elapsed >= SHAKE_AT && elapsed <= SHAKE_END) {
        const progress = (elapsed - SHAKE_AT) / (SHAKE_END - SHAKE_AT);
        const magnitude = SHAKE_MAGNITUDE * Math.min(window.innerWidth, SHAKE_MAX_WIDTH) * (1 - easeOut(progress));
        const frequency = SHAKE_FREQUENCY * Math.max(0, 1 - (elapsed - SHAKE_AT) / (SHAKE_FREQ_END - SHAKE_AT));
        if (last !== null) phase += ((now - last) / 1000) * frequency;
        const offset = magnitude * Math.sin(phase * 2 * Math.PI) * (frequency > 0 ? 1 : 0);
        const shift = offset / Math.SQRT2;
        // translate3d: a GPU só move a camada. O "desfoque de movimento" (filter: blur a cada quadro) foi tirado:
        // redesenhar o desfoque do grupo inteiro a cada quadro era o que travava a animação no celular.
        element.style.transform = `translate3d(${shift}px, ${-shift}px, 0)`;
      } else if (elapsed > SHAKE_END) {
        element.style.transform = "none";
      }
      last = elapsed >= SHAKE_AT ? now : null;
      if (elapsed < SHAKE_END + 50) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ref, enabled]);
}

/** Depois de quanto tempo aparece o "Toque para continuar" (a animação de entrada já terminou). */
const HINT_AT = SHAKE_END - 400;
/** Saída (depois do toque): a faixa cobre a tela em ~550 ms, o fundo some por trás dela, e acaba em 1,6 s. */
const LEAVE_BACKDROP_MS = 550;
const LEAVE_TOTAL_MS = 1600;
const REDUCED_LEAVE_MS = 300;

/**
 * Animação de "Ofensiva aumentada" por cima da tela (depois de concluir a atividade, ao voltar para a trilha):
 * fogo aparece, o número antigo cai, vira o novo com um tremor e "Aumentada" cresce com brilho. Aí ela PARA e espera:
 * só sai quando a pessoa toca (aparece "Toque para continuar"); então a faixa roxa sobe revelando a trilha.
 * Tocar durante a entrada pula direto para o número novo. Com "menos movimento", mostra só o número novo e some no toque.
 * @param {{from: number, to: number, onDone: () => void}} props
 * Usado por: StreakCelebrationHost (App.jsx).
 */
export function StreakCelebration({ from, to, onDone }) {
  const { settings } = useSettings();
  const reduced = prefersReducedMotion();
  const groupRef = useRef(null);
  const [swapped, setSwapped] = useState(reduced);
  const [hint, setHint] = useState(reduced);
  const [leaving, setLeaving] = useState(false);
  const [backdropGone, setBackdropGone] = useState(false);
  const leaveTimers = useRef([]);
  const containerRef = useRef(null);

  useDiagonalShake(groupRef, !reduced);

  useEffect(() => {
    const timers = [
      setTimeout(() => {
        setSwapped(true);
        playCelebrationFeedback(settings.soundsAndVibration);
      }, reduced ? 0 : SWAP_AT),
      setTimeout(() => setHint(true), reduced ? 0 : HINT_AT),
    ];
    return () => {
      timers.forEach(clearTimeout);
      leaveTimers.current.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Foco na animação: Enter/espaço também continuam (teclado e leitor de tela).
  useEffect(() => containerRef.current?.focus({ preventScroll: true }), []);

  /** Toque: durante a entrada, pula para o número novo; depois, sai (faixa roxa) e só então avisa que acabou. */
  function handleTap() {
    if (leaving) return;
    if (!swapped) {
      setSwapped(true);
      setHint(true);
      playCelebrationFeedback(settings.soundsAndVibration);
      return;
    }
    setLeaving(true);
    leaveTimers.current = reduced
      ? [setTimeout(onDone, REDUCED_LEAVE_MS)]
      : [setTimeout(() => setBackdropGone(true), LEAVE_BACKDROP_MS), setTimeout(onDone, LEAVE_TOTAL_MS)];
  }

  const classes = ["streak-celebration", reduced && "streak-celebration--reduced", leaving && "streak-celebration--leaving"].filter(Boolean).join(" ");
  return (
    <div
      className={classes}
      role="button"
      tabIndex={0}
      aria-live="assertive"
      aria-label={`Ofensiva aumentada: ${to} ${to === 1 ? "dia" : "dias"} seguidos. Toque para continuar.`}
      onClick={handleTap}
      onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && handleTap()}
      ref={containerRef}
    >
      {!backdropGone && (
        <div className="streak-celebration__backdrop">
          <div className="streak-celebration__group" ref={groupRef}>
            <span className="streak-celebration__fire"><AnimatedFire still={reduced} /></span>
            <span className="streak-celebration__number-slot">
              {swapped
                ? <strong key="new" className="streak-celebration__number">{to}</strong>
                : <strong key="old" className="streak-celebration__number streak-celebration__number--drop">{from}</strong>}
            </span>
            <span className="streak-celebration__label">Ofensiva</span>
            {swapped && (
              <span className="streak-celebration__raised">
                <span className="streak-celebration__raised-glow" aria-hidden="true">Aumentada</span>
                <span className="streak-celebration__raised-text">Aumentada</span>
              </span>
            )}
          </div>
          <span className={`streak-celebration__hint${hint && !leaving ? " streak-celebration__hint--visible" : ""}`} aria-hidden="true">
            Toque para continuar
          </span>
        </div>
      )}
      {!reduced && leaving && <span className="streak-celebration__wipe" aria-hidden="true" />}
    </div>
  );
}
