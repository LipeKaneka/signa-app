import { AttemptModel } from "../models/model-attempt.js";
import { ActivityModel } from "../models/model-activity.js";
import { getProgressRules } from "./service-settings.js";
import { getXpMultiplier } from "./service-event.js";
import { describeLevel } from "./service-level.js";
import { notFound, conflict, badRequest } from "../utils/util-http-error.js";
import { UserModel } from "../models/model-user.js";
import { findUnlockedActivity } from "./service-trail.js";
import { registerActivityDay } from "./service-streak.js";
import { readUserAchievementMetrics, readAchievementOverrides, findNewlyUnlocked, listAchievementsWithProgress, recordUnlockDates } from "./service-achievement.js";
import { toPublicProfile } from "./service-user.js";
import { notifyAchievements, notifyLevelUp } from "./service-notification.js";
import { CAMERA_UNAVAILABLE_OPTION, findCameraTarget } from "../config/camera-targets.js";

/**
 * Versão da pergunta que pode ir para o app: SEM gabarito e, em "sign_choice", só com a glosa
 * para o avatar VLibras (avatar: {gloss, reviewed}).
 * @param {object} question
 * @returns {{key: string, type: string, prompt: string, options: {id: string, text: string}[], avatar: object|null}}
 */
function toPublicQuestion(question) {
  const sign = question.sign;
  return {
    key: question.key,
    type: question.type,
    prompt: question.prompt,
    options: question.options.map(({ id, text }) => ({ id, text })),
    avatar: sign?.vlibrasGloss ? { gloss: sign.vlibrasGloss, reviewed: sign.glossReviewed } : null,
    // "Faça o sinal": o alvo não é segredo (a pessoa precisa saber qual sinal fazer).
    ...(question.type === "camera_sign" ? { target: question.target, targetKind: findCameraTarget(question.target)?.kind ?? "letter" } : {}),
  };
}

/**
 * Data limite da tentativa (agora + ATTEMPT_EXPIRATION_MINUTES das regras valendo).
 * @param {typeof import("../config/rules.js").PROGRESS_RULES} rules - de getProgressRules().
 * @param {Date} [now]
 * @returns {Date}
 */
function computeExpiration(rules, now = new Date()) {
  return new Date(now.getTime() + rules.ATTEMPT_EXPIRATION_MINUTES * 60 * 1000);
}

/**
 * Perguntas de uma tentativa: todas, na ordem cadastrada; ou, se a atividade tiver questionsPerAttempt,
 * um sorteio dessa quantidade em ordem aleatória (cada tentativa vem diferente).
 * @param {object} activity
 * @returns {object[]}
 */
function drawQuestions(activity) {
  const limit = activity.questionsPerAttempt;
  if (!limit || limit >= activity.questions.length) {
    return limit ? shuffleQuestions(activity.questions) : activity.questions;
  }
  return shuffleQuestions(activity.questions).slice(0, limit);
}

/** Cópia embaralhada (Fisher-Yates). */
function shuffleQuestions(questions) {
  const copy = [...questions];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

/**
 * Começa uma tentativa: expira tentativas abertas da mesma atividade e cria uma nova.
 * Guarda quais perguntas saíram (questionKeys): a correção e a nota valem só para elas.
 * @param {object} user
 * @param {string} activityId
 * @returns {Promise<{attemptId: string, activity: {id: string, title: string, order: number, questions: object[]}}>}
 * Usado por: POST /activities/:activityId/attempts.
 */
export async function startAttempt(user, activityId) {
  const { activity } = await findUnlockedActivity(user, activityId);

  await AttemptModel.updateMany(
    { user: user._id, activity: activity._id, status: "in_progress" },
    { status: "expired" },
  );
  const questions = drawQuestions(activity);
  const attempt = await AttemptModel.create({
    user: user._id,
    activity: activity._id,
    questionKeys: questions.map((question) => question.key),
    expiresAt: computeExpiration(await getProgressRules()),
    liveCorrectAnswers: true,
  });

  return {
    attemptId: String(attempt._id),
    activity: {
      id: String(activity._id),
      title: activity.title,
      order: activity.order,
      questions: questions.map(toPublicQuestion),
    },
  };
}

/**
 * Busca uma tentativa do próprio usuário que ainda pode receber respostas (marca como expirada se venceu).
 * @param {object} user
 * @param {string} attemptId
 * @returns {Promise<object>}
 * @throws {HttpError} 404 se não for dele; 409 se já encerrada ou expirada.
 */
async function findOpenAttempt(user, attemptId) {
  const attempt = await AttemptModel.findOne({ _id: attemptId, user: user._id });
  if (!attempt) throw notFound("Tentativa não encontrada.");
  if (attempt.status !== "in_progress") throw conflict("Esta tentativa já foi encerrada.");
  if (attempt.expiresAt < new Date()) {
    attempt.status = "expired";
    await attempt.save();
    throw conflict("Esta tentativa expirou. Comece de novo.");
  }
  return attempt;
}

/**
 * Corrige uma resposta no servidor. Cada pergunta só pode ser respondida uma vez por tentativa
 * (garantido de forma atômica no banco).
 * @param {object} user
 * @param {string} attemptId
 * @param {string} questionKey - ex.: "q1".
 * @param {string} optionId - ex.: "a".
 * @returns {Promise<{correct: boolean, correctOptionId: string, explanation: string, xpForQuestion: number,
 *   newAchievements: {id: string, title: string}[]}>}
 *   xpForQuestion = XP por acerto x multiplicador de evento ativo (o valor da "pílula" +XP do app).
 *   newAchievements = conquistas desbloqueadas por ESTE acerto (ex.: "65 acertos"), para o app avisar na hora.
 * Usado por: POST /attempts/:attemptId/answers (folha verde/laranja do app).
 */
export async function answerQuestion(user, attemptId, questionKey, optionId) {
  const attempt = await findOpenAttempt(user, attemptId);
  const activity = await ActivityModel.findById(attempt.activity).lean();
  const question = activity.questions.find((q) => q.key === questionKey);
  if (!question) throw badRequest("Pergunta não encontrada nesta atividade.");
  if (attempt.questionKeys?.length && !attempt.questionKeys.includes(questionKey)) {
    throw badRequest("Esta pergunta não faz parte desta tentativa.");
  }
  // Pergunta de câmera sem câmera no aparelho: registra como pulada (fora da nota), sem contar como erro.
  const skipped = question.type === "camera_sign" && optionId === CAMERA_UNAVAILABLE_OPTION;
  if (!skipped && !question.options.some((option) => option.id === optionId)) throw badRequest("Alternativa inválida.");

  const correct = !skipped && question.correctOptionId === optionId;
  const updated = await AttemptModel.findOneAndUpdate(
    { _id: attempt._id, status: "in_progress", "answers.questionKey": { $ne: questionKey } },
    { $push: { answers: { questionKey, optionId, correct, skipped } } },
  );
  if (!updated) throw conflict("Esta pergunta já foi respondida.");

  const newAchievements = correct && attempt.liveCorrectAnswers ? await countCorrectAnswerNow(user) : [];
  const rules = await getProgressRules();
  const { multiplier } = await getXpMultiplier();
  return {
    correct,
    skipped,
    correctOptionId: question.correctOptionId,
    explanation: question.explanation,
    xpForQuestion: correct ? Math.round(rules.XP_PER_CORRECT_ANSWER * multiplier) : 0,
    newAchievements,
  };
}

/**
 * Soma 1 acerto ao usuário na hora (atômico) e devolve as conquistas que ele acabou de desbloquear (com a data
 * registrada). Só os acertos mudam durante a atividade; XP, ofensiva e atividades concluídas contam ao encerrar.
 * @param {object} user - documento do usuário (o total em memória também é atualizado).
 * @returns {Promise<{id: string, title: string}[]>}
 */
async function countCorrectAnswerNow(user) {
  const metricsBefore = await readUserAchievementMetrics(user);
  const updated = await UserModel.findOneAndUpdate({ _id: user._id }, { $inc: { totalCorrectAnswers: 1 } }, { returnDocument: "after" })
    .select("totalCorrectAnswers")
    .lean();
  user.totalCorrectAnswers = updated.totalCorrectAnswers;
  const metricsAfter = { ...metricsBefore, totalCorrectAnswers: updated.totalCorrectAnswers };
  const overrides = readAchievementOverrides(user);
  const unlocked = await findNewlyUnlocked(metricsBefore, metricsAfter, overrides);
  if (unlocked.length > 0 && recordUnlockDates(user, await listAchievementsWithProgress(metricsAfter, overrides))) {
    await UserModel.updateOne({ _id: user._id }, { $set: { achievementUnlocks: user.achievementUnlocks } });
  }
  notifyAchievements(user._id, unlocked).catch(() => {});
  return unlocked;
}

/**
 * XP ganho ao concluir: (acertos x XP por acerto (menor ao refazer) + bônus de atividade perfeita na primeira vez)
 * x multiplicador do evento ativo (ex.: 2x XP), arredondado.
 * @param {number} correctAnswers
 * @param {number} totalQuestions
 * @param {boolean} alreadyCompleted
 * @param {typeof import("../config/rules.js").PROGRESS_RULES} rules - de getProgressRules().
 * @param {number} multiplier - de getXpMultiplier() (1 sem evento).
 * @returns {number}
 */
function computeXp(correctAnswers, totalQuestions, alreadyCompleted, rules, multiplier) {
  const xpPerAnswer = alreadyCompleted ? rules.REPLAY_XP_PER_CORRECT_ANSWER : rules.XP_PER_CORRECT_ANSWER;
  const isPerfect = correctAnswers === totalQuestions;
  const bonus = isPerfect && !alreadyCompleted ? rules.PERFECT_ACTIVITY_BONUS_XP : 0;
  return Math.round((correctAnswers * xpPerAnswer + bonus) * multiplier);
}

/**
 * Guarda a melhor nota da atividade no usuário (sem salvar) e atualiza o contador de atividades concluídas.
 * @param {object} user
 * @param {string|object} activityId
 * @param {number} score - 0 a 100.
 * @returns {void}
 */
function saveBestScore(user, activityId, score) {
  const entry = user.completedActivities.find((item) => String(item.activity) === String(activityId));
  if (entry) {
    entry.bestScore = Math.max(entry.bestScore, score);
    return;
  }
  user.completedActivities.push({ activity: activityId, bestScore: score });
  user.completedActivitiesCount = user.completedActivities.length;
}

/**
 * Encerra a tentativa: calcula nota, aprovação, XP, ofensiva, melhor nota e conquistas desbloqueadas.
 * Encerrar é atômico (duas chamadas simultâneas não dão XP duas vezes).
 * @param {object} user
 * @param {string} attemptId
 * @returns {Promise<{result: {correctAnswers, totalQuestions, score, passed, xpEarned, xpMultiplier, newAchievements}, user: object}>}
 *   xpMultiplier = multiplicador de evento aplicado (1 sem evento); user inclui o nível (level).
 * Usado por: POST /attempts/:attemptId/finish (tela "Você viu N sinais").
 * É o lugar natural para disparar novas regras de conquista, eventos e recompensas.
 */
export async function finishAttempt(user, attemptId) {
  const attempt = await findOpenAttempt(user, attemptId);
  const closed = await AttemptModel.findOneAndUpdate(
    { _id: attempt._id, status: "in_progress" },
    { status: "finished", finishedAt: new Date() },
    { returnDocument: "after" },
  );
  if (!closed) throw conflict("Esta tentativa já foi encerrada.");

  const activity = await ActivityModel.findById(closed.activity).select("questions.key").lean();
  // Tentativas antigas (antes do sorteio) não têm questionKeys: valem todas as perguntas da atividade.
  // Perguntas de câmera puladas por falta de câmera não contam na nota.
  const skippedAnswers = closed.answers.filter((answer) => answer.skipped).length;
  const totalQuestions = Math.max((closed.questionKeys?.length || activity.questions.length) - skippedAnswers, 0);
  const correctAnswers = closed.answers.filter((answer) => answer.correct).length;
  const score = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
  const rules = await getProgressRules();
  const { multiplier } = await getXpMultiplier();
  const passed = score >= rules.MIN_SCORE_TO_PASS;
  const alreadyCompleted = user.completedActivities.some((item) => String(item.activity) === String(closed.activity));

  const metricsBefore = await readUserAchievementMetrics(user);
  const levelBefore = await describeLevel(user.xp);
  const xpEarned = passed ? computeXp(correctAnswers, totalQuestions, alreadyCompleted, rules, multiplier) : 0;

  user.xp += xpEarned;
  // Tentativas novas já somaram cada acerto na hora da resposta (countCorrectAnswerNow).
  if (!closed.liveCorrectAnswers) user.totalCorrectAnswers += correctAnswers;
  registerActivityDay(user);
  if (passed) saveBestScore(user, closed.activity, score);
  await user.save();

  const metricsAfter = await readUserAchievementMetrics(user);
  const overrides = readAchievementOverrides(user);
  const newAchievements = await findNewlyUnlocked(metricsBefore, metricsAfter, overrides);
  if (recordUnlockDates(user, await listAchievementsWithProgress(metricsAfter, overrides))) await user.save();

  const result = { correctAnswers, totalQuestions, score, passed, xpEarned, xpMultiplier: multiplier, newAchievements };
  closed.result = result;
  await closed.save();

  const levelAfter = await describeLevel(user.xp);
  // Notificações (sino e celular): não esperam, para não atrasar a tela de resultado.
  notifyAchievements(user._id, newAchievements).then(() => notifyLevelUp(user._id, levelBefore, levelAfter)).catch(() => {});
  return { result, user: { ...toPublicProfile(user), level: levelAfter } };
}
