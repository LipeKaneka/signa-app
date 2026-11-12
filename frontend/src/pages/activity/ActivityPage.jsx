import { lazy, Suspense, useCallback, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import * as TrailApi from "../../api/api-trail.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useSettings } from "../../context/SettingsContext.jsx";
import { useAsyncData } from "../../hooks/useAsyncData.js";
import { ErrorState, LoadingState } from "../../components/layout.jsx";
import { SignAvatar } from "../../features/vlibras/SignAvatar.jsx";
import { replayLastSign } from "../../features/vlibras/vlibras-player.js";
import { Icon } from "../../components/Icon.jsx";
import { playAnswerFeedback } from "../../utils/feedback-effects.js";
import { ActivityHeader, FeedbackSheet, OptionsGrid } from "./activity-parts.jsx";
import { ActivityResult } from "./ActivityResult.jsx";
import { EventBanner } from "../../components/EventBanner.jsx";
import { AchievementToast } from "../../components/AchievementToast.jsx";
import "./activity.css";

// A pergunta de câmera carrega o MediaPipe (pesado): só baixa quando a atividade tem uma.
const CameraSignQuestion = lazy(() => import("./CameraSignQuestion.jsx"));

/** Pergunta de teoria (texto, sem avatar): múltipla escolha ou verdadeiro/falso. */
const isTextQuestion = (question) => question.type === "single_choice" || question.type === "true_false";

/**
 * Item da tela de resultado (para rever o sinal): resposta certa, se acertou e o avatar. Na teoria, a explicação.
 */
function buildReviewItem(question, feedback) {
  // Pergunta de câmera: o que se revê é o sinal-alvo, não o texto do botão.
  const answer = question.type === "camera_sign"
    ? question.target
    : question.options.find((option) => option.id === feedback.correctOptionId)?.text ?? "";
  return {
    key: question.key,
    correct: feedback.correct,
    answer,
    avatar: question.avatar,
    ...(isTextQuestion(question) ? { prompt: question.prompt, explanation: feedback.explanation } : {}),
  };
}

/**
 * Tela da atividade: inicia a tentativa, mostra cada pergunta com o avatar, envia as respostas,
 * mostra as folhas de acerto/erro e, no fim, o resultado. Toda correção e XP vêm do backend.
 */
export function ActivityPage() {
  const { activityId } = useParams();
  const navigate = useNavigate();
  // Veio da tela de unidades: ao sair ou concluir, volta para o mesmo módulo.
  const moduleId = useSearchParams()[0].get("modulo");
  const { user, setUser } = useAuth();
  const { settings } = useSettings();

  const loadAttempt = useCallback(() => TrailApi.startAttempt(activityId), [activityId]);
  const { data: attempt, error, loading, reload } = useAsyncData(loadAttempt, [loadAttempt]);

  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [reviewItems, setReviewItems] = useState([]);
  const [result, setResult] = useState(null);
  // Nível novo alcançado nesta atividade (para o aviso "Você subiu para o nível X"), ou null.
  const [levelUp, setLevelUp] = useState(null);
  const [actionError, setActionError] = useState("");
  // Conquistas desbloqueadas durante a atividade (ex.: 65 acertos no total): aviso na hora e listadas no resultado.
  const [liveAchievements, setLiveAchievements] = useState([]);
  const [busy, setBusy] = useState(false);
  // Muda para a folha de feedback subir de novo (ex.: falhou ao encerrar a tentativa).
  const [sheetKey, setSheetKey] = useState(0);

  const goToTrail = () => navigate(moduleId ? `/trilha/modulo/${moduleId}` : "/trilha");

  if (loading) return <LoadingState message="Preparando a atividade…" />;
  if (error) return <ErrorState message={error.message} onRetry={error.status === 403 ? goToTrail : reload} />;

  const questions = attempt.activity.questions;
  const question = questions[questionIndex];
  const isLastQuestion = questionIndex === questions.length - 1;

  if (result) {
    return (
      <ActivityResult
        result={result}
        levelUp={levelUp}
        reviewItems={reviewItems}
        earnedDuringActivity={liveAchievements}
        onContinue={goToTrail}
        onBack={goToTrail}
      />
    );
  }

  /** Envia a resposta. @returns {Promise<boolean>} false se falhou (a pergunta de câmera libera nova tentativa). */
  async function selectOption(optionId) {
    if (feedback || busy) return false;
    setSelectedOptionId(optionId);
    setBusy(true);
    setActionError("");
    try {
      const answer = await TrailApi.answerQuestion(attempt.attemptId, question.key, optionId);
      // Pergunta pulada por falta de câmera: sem som de erro (não conta na nota).
      if (!answer.skipped) playAnswerFeedback(answer.correct, settings.soundsAndVibration);
      setFeedback(answer);
      setReviewItems((items) => [...items, buildReviewItem(question, answer)]);
      if (answer.newAchievements?.length) setLiveAchievements((current) => [...current, ...answer.newAchievements]);
      return true;
    } catch (answerError) {
      setSelectedOptionId(null);
      setActionError(answerError.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function goToNextQuestion() {
    if (!isLastQuestion) {
      setQuestionIndex((index) => index + 1);
      setSelectedOptionId(null);
      setFeedback(null);
      // A folha pode ter rolado a tela para baixo (fonte grande): a próxima pergunta começa do topo.
      window.scrollTo(0, 0);
      return;
    }
    setBusy(true);
    try {
      const summary = await TrailApi.finishAttempt(attempt.attemptId);
      const previousLevel = user?.level?.level;
      const newLevel = summary.user.level;
      setLevelUp(previousLevel && newLevel && newLevel.level > previousLevel ? newLevel : null);
      setUser(summary.user);
      setResult(summary.result);
    } catch (finishError) {
      setActionError(finishError.message);
      setSheetKey((key) => key + 1);
    } finally {
      setBusy(false);
    }
  }

  function exitActivity() {
    if (window.confirm("Sair da atividade? O progresso desta tentativa será perdido.")) goToTrail();
  }

  return (
    <div className="screen activity-screen">
      <ActivityHeader current={questionIndex + 1} total={questions.length} onExit={exitActivity} />
      <main className="activity-body">
        <div className="activity-heading">
          <div>
            <h1 className="activity-title">{attempt.activity.order}. {attempt.activity.title}</h1>
            <p className={`activity-prompt${isTextQuestion(question) ? " activity-prompt--question" : ""}`}>{question.prompt}</p>
            <EventBanner compact />
          </div>
          {question.avatar && question.type !== "camera_sign" && (
            <button type="button" className="icon-button activity-replay" onClick={replayLastSign} aria-label="Ver o sinal de novo">
              <Icon name="replay" size={22} strokeWidth={1.8} />
            </button>
          )}
        </div>

        {question.type === "camera_sign" ? (
          <Suspense fallback={<LoadingState message="Abrindo a câmera…" />}>
            <CameraSignQuestion key={question.key} question={question} answered={Boolean(feedback)} onAnswer={selectOption} />
          </Suspense>
        ) : (
          <>
            {question.avatar ? (
              <SignAvatar key={question.key} avatar={question.avatar} compact />
            ) : (
              !isTextQuestion(question) && <div className="sign-frame" />
            )}
            <OptionsGrid
              layout={isTextQuestion(question) ? "list" : "grid"}
              options={question.options}
              selectedOptionId={selectedOptionId}
              feedback={feedback}
              disabled={Boolean(feedback) || busy}
              onSelect={selectOption}
            />
          </>
        )}
        {actionError && <p className="form-error" role="alert">{actionError}</p>}
        {settings.tipsDuringLessons && !feedback && (
          <p className="activity-tip">Dica: toque em ↻ para ver o sinal de novo quantas vezes quiser antes de responder.</p>
        )}
      </main>

      {feedback && (
        <FeedbackSheet
          key={sheetKey}
          feedback={feedback}
          onNext={goToNextQuestion}
          isLast={isLastQuestion}
          explanation={isTextQuestion(question) ? feedback.explanation : ""}
        />
      )}
      <AchievementToast items={liveAchievements.map((achievement) => ({ id: `achievement-${achievement.id}`, kind: "achievement", title: achievement.title, appearance: achievement.appearance, rarity: achievement.rarity }))} />
    </div>
  );
}
