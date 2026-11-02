import * as RankingService from "../services/service-ranking.js";
import { RANKING_RULES } from "../config/rules.js";
import { readPositiveInteger } from "../utils/util-validators.js";
import { badRequest } from "../utils/util-http-error.js";

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

/**
 * GET /ranking?metric=&limit= — responde o ranking (veja getRanking em service-ranking.js).
 */
export async function getRanking(req, res) {
  const metric = readMetric(req.query.metric);
  const limit = readPositiveInteger(req.query.limit, {
    fallback: RANKING_RULES.DEFAULT_LIMIT,
    max: RANKING_RULES.MAX_LIMIT,
  });
  const ranking = await RankingService.getRanking(req.userId, metric, limit);
  res.json(ranking);
}
