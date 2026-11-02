import { UserModel } from "../models/model-user.js";
import { toDayKey } from "./service-streak.js";

/**
 * Critérios do ranking -> campo do usuário ordenado. Para um critério novo, acrescente aqui
 * (e um índice no model-user).
 */
export const RANKING_METRICS = Object.freeze({
  activities: "completedActivitiesCount",
  xp: "xp",
  streak: "streak",
});

/**
 * Quem entra no ranking: contas ativas com "aparecer no ranking" ligado.
 * Na ofensiva, só quem estudou hoje ou ontem (a dos outros já zerou).
 * @param {string} metric
 * @param {Date} [now]
 * @returns {object} filtro do Mongo.
 */
function buildBaseFilter(metric, now = new Date()) {
  const filter = { showInRanking: true, status: "active" };
  if (metric === "streak") {
    const yesterday = toDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    filter.lastActivityDay = { $in: [toDayKey(now), yesterday] };
  }
  return filter;
}

/**
 * Linha pública do ranking (sem dados sensíveis).
 * @returns {{position: number, publicId: string, nickname: string, city: string, value: number, isMe: boolean}}
 */
function toRankingRow(user, position, field, viewerId) {
  return {
    position,
    publicId: user.publicId,
    nickname: user.nickname,
    city: user.city,
    avatar: user.avatarThumb ?? "",
    value: user[field],
    isMe: String(user._id) === String(viewerId),
  };
}

/**
 * Posição do usuário: quantos estão à frente + 1 (empate decidido pelo cadastro mais antigo).
 * @returns {Promise<number>}
 */
async function findPosition(baseFilter, field, user) {
  const ahead = await UserModel.countDocuments({
    ...baseFilter,
    $or: [{ [field]: { $gt: user[field] } }, { [field]: user[field], _id: { $lt: user._id } }],
  });
  return ahead + 1;
}

/**
 * Quem está logo acima, o próprio usuário e quem está logo abaixo.
 * @returns {Promise<ReturnType<typeof toRankingRow>[]>}
 */
async function findNeighbors(baseFilter, field, viewer, position) {
  const sort = { [field]: -1, _id: 1 };
  const skip = Math.max(position - 2, 0);
  const users = await UserModel.find(baseFilter).sort(sort).skip(skip).limit(3).lean();
  return users.map((user, index) => toRankingRow(user, skip + index + 1, field, viewer._id));
}

/**
 * Compara com a consulta anterior (positionChange > 0 = subiu) e guarda a posição atual e a melhor.
 * @returns {Promise<{positionChange: number, bestPosition: number}>}
 * Base para conquistas de ranking (ex.: "Entre no top 10", "Suba 5 posições").
 */
async function trackViewerPosition(viewer, metric, position) {
  const history = viewer.rankingPositions?.[metric] ?? {};
  const positionChange = history.last == null ? 0 : history.last - position;
  const bestPosition = history.best == null ? position : Math.min(history.best, position);
  await UserModel.updateOne(
    { _id: viewer._id },
    { $set: { [`rankingPositions.${metric}`]: { last: position, best: bestPosition } } },
  );
  return { positionChange, bestPosition };
}

/**
 * Ranking completo para a tela: top N, posição do usuário, variação, melhor posição e vizinhos.
 * @param {object} viewer - usuário logado.
 * @param {"activities"|"xp"|"streak"} metric
 * @param {number} limit
 * @returns {Promise<{metric: string, top: object[], me: object|null, neighbors: object[]}>}
 * Usado por: GET /ranking.
 */
export async function getRanking(viewer, metric, limit) {
  const field = RANKING_METRICS[metric];
  const baseFilter = buildBaseFilter(metric);
  const topUsers = await UserModel.find(baseFilter).sort({ [field]: -1, _id: 1 }).limit(limit).lean();
  const top = topUsers.map((user, index) => toRankingRow(user, index + 1, field, viewer._id));

  const viewerIsListed = await UserModel.exists({ _id: viewer._id, ...baseFilter });
  if (!viewerIsListed) return { metric, top, me: null, neighbors: [] };

  const position = await findPosition(baseFilter, field, viewer);
  const { positionChange, bestPosition } = await trackViewerPosition(viewer, metric, position);
  return {
    metric,
    top,
    me: { position, value: viewer[field], positionChange, bestPosition },
    neighbors: await findNeighbors(baseFilter, field, viewer, position),
  };
}
