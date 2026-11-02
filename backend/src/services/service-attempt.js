import { callServer, userPath } from "../clients/server-client.js";

/**
 * Começa uma tentativa. As perguntas chegam do servidor já sem gabarito.
 * @param {string} userId
 * @param {string} activityId
 * @returns {Promise<{attemptId: string, activity: {id, title, order, questions}}>}
 * Usado por: POST /activities/:activityId/attempts.
 */
export function startAttempt(userId, activityId) {
  return callServer(userPath(userId, "/attempts"), { method: "POST", body: { activityId } });
}

/**
 * Envia uma resposta para correção (feita no servidor, uma vez por pergunta).
 * @param {string} userId
 * @param {string} attemptId
 * @param {string} questionKey
 * @param {string} optionId
 * @returns {Promise<{correct: boolean, correctOptionId: string, explanation: string, xpForQuestion: number}>}
 * Usado por: POST /attempts/:attemptId/answers.
 */
export function answerQuestion(userId, attemptId, questionKey, optionId) {
  return callServer(userPath(userId, `/attempts/${encodeURIComponent(attemptId)}/answers`), {
    method: "POST",
    body: { questionKey, optionId },
  });
}

/**
 * Encerra a tentativa: nota, XP, ofensiva e conquistas novas são calculados no servidor (de forma atômica).
 * @param {string} userId
 * @param {string} attemptId
 * @returns {Promise<{result: object, user: object}>}
 * Usado por: POST /attempts/:attemptId/finish.
 */
export function finishAttempt(userId, attemptId) {
  return callServer(userPath(userId, `/attempts/${encodeURIComponent(attemptId)}/finish`), { method: "POST" });
}
