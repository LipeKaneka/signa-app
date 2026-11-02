import { callServer, userPath } from "../clients/server-client.js";

/** Critérios aceitos pelo ranking (validados aqui antes de chamar o servidor). */
export const RANKING_METRICS = Object.freeze({
  activities: "activities",
  xp: "xp",
  streak: "streak",
});

/**
 * Ranking do ponto de vista do usuário: top N, posição, variação, melhor posição e vizinhos.
 * @param {string} userId
 * @param {"activities"|"xp"|"streak"} metric
 * @param {number} limit
 * @returns {Promise<{metric: string, top: object[], me: object|null, neighbors: object[]}>}
 * Usado por: GET /ranking.
 */
export function getRanking(userId, metric, limit) {
  return callServer(userPath(userId, "/ranking"), { query: { metric, limit } });
}
