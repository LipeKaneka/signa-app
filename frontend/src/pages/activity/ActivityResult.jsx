import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon.jsx";
import { SignDialog } from "../../components/SignDialog.jsx";
import { prefersReducedMotion } from "../../utils/motion.js";
import { AchievementToast } from "../../components/AchievementToast.jsx";
import { formatMultiplier } from "../../components/EventBanner.jsx";
import { useAppConfig } from "../../context/AppConfigContext.jsx";
import { formatCompact, formatFull } from "../../utils/format-number.js";

/** Ícone de acerto: círculo com visto (quadrado roxo). */
function CorrectMark() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M38 20.5 V22 A16 16 0 1 1 28.5 7.4" />
      <path d="M38 9 L22 25 L16.5 19.5" />
    </svg>
  );
}

/** Ícone de erro: X laranja (quadrado tracejado). */
function WrongMark() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" aria-hidden="true">
      <path d="M8 8 L32 32 M32 8 L8 32" />
    </svg>
  );
}

/**
 * Tela "Você viu N sinais nessa atividade" (protótipo 14/15).
 * reviewItems = [{key, correct, answer, avatar}] na ordem das perguntas.
 * levelUp = nível novo alcançado nesta atividade ({level, title}) ou null.
 * Conquistas novas e nível novo aparecem como aviso no topo (AchievementToast) e ficam listados na tela.
 * earnedDuringActivity = conquistas já avisadas durante a atividade (só listadas aqui, sem aviso de novo).
 */
/** Duração da abertura (círculo + título + subtítulo + resto), como na animação do protótipo. */
const INTRO_MS = 3000;

export function ActivityResult({ result, levelUp, reviewItems, earnedDuringActivity = [], onContinue, onBack }) {
  const [openItem, setOpenItem] = useState(null);
  // Abertura animada: um toque na tela pula direto para o fim (e não aciona nada escondido durante ela).
  const [introDone, setIntroDone] = useState(() => prefersReducedMotion());
  useEffect(() => {
    if (introDone) return undefined;
    const timer = setTimeout(() => setIntroDone(true), INTRO_MS);
    return () => clearTimeout(timer);
  }, [introDone]);
  const skipIntro = (event) => {
    if (introDone) return;
    event.stopPropagation();
    event.preventDefault();
    setIntroDone(true);
  };
  const seen = reviewItems.length || result.totalQuestions;
  const allCorrect = result.correctAnswers >= result.totalQuestions && result.totalQuestions > 0;
  const { minScoreToPass } = useAppConfig();
  const multiplier = result.xpMultiplier ?? 1;
  const toasts = [
    ...result.newAchievements.map((achievement) => ({ id: `achievement-${achievement.id}`, kind: "achievement", title: achievement.title })),
    ...(levelUp ? [{ id: `level-${levelUp.level}`, kind: "level", title: `Nível ${levelUp.level}: ${levelUp.title}` }] : []),
  ];

  return (
    <div className="result-stage">
    <main className={`screen activity-result${introDone ? " activity-result--ready" : ""}`} onClickCapture={skipIntro}>
      <button type="button" className="icon-button activity-result__back" onClick={onBack} aria-label="Voltar para a trilha">
        <Icon name="back" size={22} />
      </button>
      {/* Conta também as perguntas de câmera puladas (elas foram vistas, só não entram na nota). */}
      <h1 className="activity-result__title">Você viu nessa atividade {seen} {seen === 1 ? "sinal diferente" : "sinais diferentes"}</h1>
      <p className="activity-result__subtitle">
        {allCorrect
          ? "Você acertou todos!"
          : result.correctAnswers === 0
            ? "Você não acertou nenhum."
            : `Você acertou apenas ${result.correctAnswers}.`}{" "}
        Toque abaixo para rever.
      </p>

      <ul className="review-grid">
        {reviewItems.map((item, index) => (
          <li key={item.key}>
            <button
              type="button"
              className={`review-tile ${item.correct ? "review-tile--mastered" : "review-tile--review"}`}
              onClick={() => setOpenItem(item)}
              aria-label={`Sinal ${index + 1}: ${item.answer}, ${item.correct ? "dominado" : "rever"}`}
            >
              {item.correct ? <CorrectMark /> : <WrongMark />}
            </button>
          </li>
        ))}
      </ul>

      <div className="review-legend" aria-hidden="true">
        <span><i className="review-legend__mastered" /> Dominado</span>
        <span><i className="review-legend__review" /> Rever</span>
      </div>

      <p className="result-pill">
        <strong title={formatFull(result.xpEarned)}>+{formatCompact(result.xpEarned)}XP</strong>
        {multiplier > 1 && result.xpEarned > 0 && <span className="result-pill__event"> ({formatMultiplier(multiplier)} evento)</span>} • {result.score}% de precisão
      </p>
      {/* Todas as perguntas eram de câmera e foram puladas por falta de câmera: não há nota para mostrar. */}
      {result.totalQuestions === 0 ? (
        <p className="activity-result__notice">Esta atividade precisa da câmera. Permita o acesso à câmera nas configurações do celular e tente de novo.</p>
      ) : (
        !result.passed && <p className="activity-result__notice">Acerte pelo menos {minScoreToPass}% para liberar a próxima atividade.</p>
      )}
      {levelUp && <p className="activity-result__achievement">⬆ Você subiu para o nível {levelUp.level}: {levelUp.title}</p>}
      {[...earnedDuringActivity, ...result.newAchievements].map((achievement) => (
        <p key={achievement.id} className="activity-result__achievement">🏅 Conquista desbloqueada: {achievement.title}</p>
      ))}

      <button type="button" className="button-primary button-large activity-result__continue" onClick={onContinue}>
        Continuar
      </button>

      {/* Avisos de conquista/nível só depois da abertura, para não brigar com a animação. */}
      <AchievementToast items={introDone ? toasts : []} />
      {openItem && (
        <SignDialog
          word={openItem.prompt ? `Resposta: ${openItem.answer}` : openItem.answer}
          avatar={openItem.avatar}
          description={openItem.prompt ? `${openItem.prompt} ${openItem.explanation ?? ""}`.trim() : undefined}
          onClose={() => setOpenItem(null)}
        />
      )}
    </main>
    </div>
  );
}
