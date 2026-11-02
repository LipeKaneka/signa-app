import { requestApi } from "./http-client.js";

/**
 * GET /trail. @returns {Promise<{modules}>} módulos e atividades com status. Usado por: TrailPage.
 */
export function fetchTrail() {
  return requestApi("/trail");
}

/**
 * POST /activities/:id/attempts. @returns {Promise<{attemptId, activity}>} perguntas sem gabarito.
 * Usado por: ActivityPage.
 */
export function startAttempt(activityId) {
  return requestApi(`/activities/${activityId}/attempts`, { method: "POST" });
}

/**
 * POST /attempts/:id/answers. @returns {Promise<{correct, correctOptionId, explanation, xpForQuestion}>}
 * Usado por: ActivityPage (folha de acerto/erro).
 */
export function answerQuestion(attemptId, questionKey, optionId) {
  return requestApi(`/attempts/${attemptId}/answers`, { method: "POST", body: { questionKey, optionId } });
}

/**
 * POST /attempts/:id/finish. @returns {Promise<{result, user}>} nota, XP e conquistas novas.
 * Usado por: ActivityPage (tela de resultado).
 */
export function finishAttempt(attemptId) {
  return requestApi(`/attempts/${attemptId}/finish`, { method: "POST" });
}
