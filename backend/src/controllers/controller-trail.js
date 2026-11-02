import * as TrailService from "../services/service-trail.js";
import * as AttemptService from "../services/service-attempt.js";
import { readRequiredString } from "../utils/util-validators.js";

/**
 * GET /trail — responde {modules} com o status de cada módulo/atividade.
 */
export async function getTrail(req, res) {
  const modules = await TrailService.buildTrail(req.userId);
  res.json({ modules });
}

/**
 * POST /activities/:activityId/attempts — responde 201 {message, attemptId, activity}.
 */
export async function startAttempt(req, res) {
  const attempt = await AttemptService.startAttempt(req.userId, req.params.activityId);
  res.status(201).json({ message: "Atividade iniciada.", ...attempt });
}

/**
 * POST /attempts/:attemptId/answers — valida {questionKey, optionId}; responde a correção.
 */
export async function answerQuestion(req, res) {
  const questionKey = readRequiredString(req.body?.questionKey, "a pergunta", 60);
  const optionId = readRequiredString(req.body?.optionId, "a alternativa", 60);

  const feedback = await AttemptService.answerQuestion(req.userId, req.params.attemptId, questionKey, optionId);
  res.json(feedback);
}

/**
 * POST /attempts/:attemptId/finish — responde {message, result, user}.
 */
export async function finishAttempt(req, res) {
  const summary = await AttemptService.finishAttempt(req.userId, req.params.attemptId);
  res.json({ message: "Atividade concluída.", ...summary });
}
