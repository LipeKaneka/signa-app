import { useLayoutEffect, useRef, useState } from "react";
import { useExitAnimation } from "../../hooks/useExitAnimation.js";
import { prefersReducedMotion } from "../../utils/motion.js";
import { Icon } from "../../components/Icon.jsx";
import { useAppConfig } from "../../context/AppConfigContext.jsx";
import { formatMultiplier } from "../../components/EventBanner.jsx";
import { formatCompact, formatFull } from "../../utils/format-number.js";

/**
 * Cor da barra de progresso: vermelho no início -> laranja -> amarelo -> verde no fim (como no protótipo).
 * @param {number} fraction - 0 a 1.
 * @returns {string} cor CSS.
 */
export function progressColor(fraction) {
  const hue = Math.round(120 * Math.min(Math.max(fraction, 0), 1) ** 1.3);
  return `hsl(${hue}, 95%, ${hue > 40 && hue < 90 ? 48 : 42}%)`;
}

export function ActivityHeader({ current, total, onExit }) {
  const fraction = total ? current / total : 0;
  return (
    <div className="activity-header">
      <button type="button" className="icon-button activity-header__exit" onClick={onExit} aria-label="Sair da atividade">
        <Icon name="close" size={26} strokeWidth={1.5} />
      </button>
      <div
        className="progress-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-label="Progresso da atividade"
      >
        <div className="progress-bar__fill" style={{ transform: `scaleX(${fraction})`, background: progressColor(fraction) }} />
      </div>
      <span className="activity-header__count">
        {current}/{total}
      </span>
    </div>
  );
}

function optionClassName(option, { selectedOptionId, feedback }) {
  const classes = ["option-button"];
  if (feedback) {
    if (option.id === feedback.correctOptionId) classes.push("option-button--correct");
    else if (option.id === selectedOptionId) classes.push("option-button--wrong");
  } else if (option.id === selectedOptionId) {
    classes.push("option-button--selected");
  }
  return classes.join(" ");
}

/** Ângulos (graus) das estrelas que saem do botão certo; cada uma voa numa direção. */
const STAR_ANGLES = [-90, -50, -10, 30, 70, 110, 150, 190, 230];

/** Estrelas saindo do botão ao acertar (só enfeite: escondidas do leitor de tela). */
function StarBurst() {
  return (
    <span className="star-burst" aria-hidden="true">
      {STAR_ANGLES.map((angle, index) => (
        <span key={angle} className="star-burst__star" style={{ "--angle": `${angle}deg`, "--delay": `${(index % 3) * 40}ms` }}>
          ★
        </span>
      ))}
    </span>
  );
}

/**
 * Alternativas. Depois da resposta: acerto = estrelas saindo do botão; erro = o botão escolhido treme
 * (a vibração do aparelho vem de playAnswerFeedback, na ActivityPage).
 */
export function OptionsGrid({ options, selectedOptionId, feedback, disabled, onSelect }) {
  return (
    <div className="options-grid">
      {options.map((option) => {
        const chosen = feedback && option.id === selectedOptionId;
        const hit = chosen && feedback.correct;
        return (
          <button
            key={option.id}
            type="button"
            className={`${optionClassName(option, { selectedOptionId, feedback })}${hit ? " option-button--hit" : ""}${chosen && !feedback.correct ? " option-button--shake" : ""}`}
            onClick={() => onSelect(option.id)}
            disabled={disabled}
            aria-pressed={option.id === selectedOptionId}
          >
            {option.text}
            {hit && <StarBurst />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Folha que sobe do rodapé depois da resposta (verde = acerto, laranja = erro).
 * Ao tocar em Próximo ela desce primeiro e só então avança (onAnimationEnd).
 * A frase é sorteada das listas de acerto/erro do painel (/app-config); com evento de XP ativo, a pílula mostra o multiplicador.
 */
export function FeedbackSheet({ feedback, onNext, isLast }) {
  const { leaving, startLeaving, handleAnimationEnd } = useExitAnimation(onNext);
  const { pickFeedbackPhrase, xpEvent } = useAppConfig();
  const sheetRef = useRef(null);
  const correct = feedback.correct;
  // Sorteada uma vez por resposta (a folha é montada de novo a cada pergunta). Pergunta de câmera pulada por falta de
  // câmera tem frase própria (não é erro).
  const [phrase] = useState(() =>
    feedback.skipped ? { title: "Pergunta pulada", text: "sem câmera, ela não conta na sua nota" } : pickFeedbackPhrase(correct),
  );

  // A folha cobre o rodapé da tela (e fica mais alta com a fonte grande): reserva esse espaço embaixo e rola
  // até as alternativas marcadas, para a pessoa ver a resposta certa e a que escolheu.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const update = () => root.style.setProperty("--feedback-sheet-height", `${sheetRef.current?.offsetHeight ?? 0}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(sheetRef.current);
    const answers = [...document.querySelectorAll(".option-button--correct, .option-button--wrong")];
    const lowest = answers.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
    lowest?.scrollIntoView({ block: "end", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    return () => {
      observer.disconnect();
      root.style.removeProperty("--feedback-sheet-height");
    };
  }, []);
  const classes = ["feedback-sheet", feedback.skipped ? "feedback-sheet--skipped" : correct ? "feedback-sheet--correct" : "feedback-sheet--wrong"];
  if (leaving) classes.push("feedback-sheet--leaving");

  return (
    <section ref={sheetRef} className={classes.join(" ")} aria-live="assertive" onAnimationEnd={handleAnimationEnd}>
      <h2 className="feedback-sheet__title">{phrase.title}</h2>
      {phrase.text && <p className="feedback-sheet__text">{phrase.text}</p>}
      {correct && (
        <span className="xp-pill">
          +{formatCompact(feedback.xpForQuestion)}xp{xpEvent && feedback.xpForQuestion > 0 ? ` · ${formatMultiplier(xpEvent.multiplier)}` : ""}
        </span>
      )}
      <button
        type="button"
        className="button-primary button-large feedback-sheet__next"
        onClick={startLeaving}
        disabled={leaving}
        autoFocus
      >
        {isLast ? "Ver resultado" : "Próximo"}
      </button>
    </section>
  );
}
