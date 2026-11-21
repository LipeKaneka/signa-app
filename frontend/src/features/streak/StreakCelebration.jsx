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
 * Tempos da animação (ms), tirados do projeto do Alight Motion ("Novo projeto 2"):
 * número antigo cai até 690; troca para o novo e treme em 775; "Aumentada" em 783; a faixa roxa sobe de 1766 a 3366,
 * cobre a tela inteira (o fundo some por trás dela) e sai por cima revelando a trilha.
 */
const SWAP_AT = 770;
const SHAKE_AT = 775;
const SHAKE_END = 2015;
const SHAKE_FREQ_END = 1125;
const WIPE_AT = 1766;
/**
 * A faixa cobre a tela inteira de ~300 a ~700 ms depois de começar: o fundo da animação sai no meio desse intervalo,
 * escondido atrás dela (medido em telas de 320×568 a 1024×1366).
 */
const BACKDROP_END = WIPE_AT + 550;
const TOTAL = 3366;
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
        element.style.transform = `translate(${shift}px, ${-shift}px)`;
        // "Desfoque de movimento" do projeto: mais forte quanto maior o tremor.
        element.style.filter = Math.abs(offset) > 2 ? `blur(${Math.min(Math.abs(offset) / 18, 3)}px)` : "none";
      } else if (elapsed > SHAKE_END) {
        element.style.transform = "none";
        element.style.filter = "none";
      }
      last = elapsed >= SHAKE_AT ? now : null;
      if (elapsed < SHAKE_END + 50) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ref, enabled]);
}

/**
 * Animação de "Ofensiva aumentada" por cima da tela (depois de concluir a atividade, ao voltar para a trilha):
 * fogo aparece, o número antigo cai, vira o novo com um tremor, "Aumentada" cresce com brilho e uma faixa roxa sobe
 * revelando a trilha. Tocar pula. Com "menos movimento" no sistema, mostra só o número novo e some.
 * @param {{from: number, to: number, onDone: () => void}} props
 * Usado por: StreakCelebrationHost (App.jsx).
 */
export function StreakCelebration({ from, to, onDone }) {
  const { settings } = useSettings();
  const reduced = prefersReducedMotion();
  const groupRef = useRef(null);
  const [swapped, setSwapped] = useState(reduced);
  const [backdropGone, setBackdropGone] = useState(false);
  const total = reduced ? 1800 : TOTAL;

  useDiagonalShake(groupRef, !reduced);

  useEffect(() => {
    const timers = [
      setTimeout(() => {
        setSwapped(true);
        playCelebrationFeedback(settings.soundsAndVibration);
      }, reduced ? 0 : SWAP_AT),
      setTimeout(() => setBackdropGone(true), reduced ? 1500 : BACKDROP_END),
      setTimeout(onDone, total),
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`streak-celebration${reduced ? " streak-celebration--reduced" : ""}`}
      role="status"
      aria-live="assertive"
      aria-label={`Ofensiva aumentada: ${to} ${to === 1 ? "dia" : "dias"} seguidos. Toque para continuar.`}
      onClick={onDone}
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
        </div>
      )}
      {!reduced && <span className="streak-celebration__wipe" style={{ animationDelay: `${WIPE_AT}ms` }} aria-hidden="true" />}
    </div>
  );
}
