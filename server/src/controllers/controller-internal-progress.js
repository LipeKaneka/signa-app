import * as TrailService from "../services/service-trail.js";
import * as AttemptService from "../services/service-attempt.js";
import * as RankingService from "../services/service-ranking.js";
import { RANKING_RULES } from "../config/rules.js";
import { readRequiredString, readPositiveInteger } from "../utils/util-validators.js";
import { badRequest } from "../utils/util-http-error.js";

/** GET /internal/v1/users/:userId/trail — {modules} com o status de cada módulo/atividade. */
export async function getTrail(req, res) {
  res.json({ modules: await TrailService.buildTrail(req.user) });
}

/** POST /internal/v1/users/:userId/attempts — {activityId} -> 201 {attemptId, activity}. */
export async function startAttempt(req, res) {
  const activityId = readRequiredString(req.body?.activityId, "a atividade", 60);
  res.status(201).json(await AttemptService.startAttempt(req.user, activityId));
}

/** POST /internal/v1/users/:userId/attempts/:attemptId/answers — {questionKey, optionId} -> correção. */
export async function answerQuestion(req, res) {
  const questionKey = readRequiredString(req.body?.questionKey, "a pergunta", 60);
  const optionId = readRequiredString(req.body?.optionId, "a alternativa", 60);
  res.json(await AttemptService.answerQuestion(req.user, req.params.attemptId, questionKey, optionId));
}

/** POST /internal/v1/users/:userId/attempts/:attemptId/finish — {result, user}. */
export async function finishAttempt(req, res) {
  res.json(await AttemptService.finishAttempt(req.user, req.params.attemptId));
}

/**
 * Valida ?metric= (activities | xp | streak; padrão activities).
 * @throws {HttpError} 400 se inválido.
 */
function readMetric(value) {
  const metric = value ?? "activities";
  if (!Object.hasOwn(RankingService.RANKING_METRICS, metric)) {
    throw badRequest("Critério de ranking inválido. Use activities, xp ou streak.");
  }
  return metric;
}

/** GET /internal/v1/users/:userId/ranking?metric=&limit= — ranking do ponto de vista do usuário. */
export async function getRanking(req, res) {
  const metric = readMetric(req.query.metric);
  const limit = readPositiveInteger(req.query.limit, { fallback: RANKING_RULES.DEFAULT_LIMIT, max: RANKING_RULES.MAX_LIMIT });
  res.json(await RankingService.getRanking(req.user, metric, limit));
}
