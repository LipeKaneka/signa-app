import { LevelModel } from "../models/model-level.js";
import { DEFAULT_LEVELS } from "../config/levels.js";
import { createTimedCache } from "../utils/util-timed-cache.js";

const LEVELS_CACHE_MS = 30 * 1000;
const cache = createTimedCache(LEVELS_CACHE_MS);

/**
 * Tabela de níveis em ordem crescente de XP (do banco; os padrões do código se a coleção estiver vazia).
 * @returns {Promise<{level: number, minXp: number, title: string}[]>}
 */
export function listLevels() {
  return cache.get("levels", async () => {
    const levels = await LevelModel.find().sort({ minXp: 1 }).lean();
    const source = levels.length > 0 ? levels : DEFAULT_LEVELS;
    return source.map(({ level, minXp, title }) => ({ level, minXp, title }));
  });
}

/**
 * Nível de quem tem "xp" pontos e quanto falta para o próximo.
 * @param {number} xp
 * @returns {Promise<{level: number, title: string, minXp: number, nextLevelXp: number|null}>}
 *   nextLevelXp = XP total para o próximo nível (null no último).
 * Usado por: service-user.js (perfil) e service-attempt.js (perfil devolvido no fim da atividade).
 */
export async function describeLevel(xp) {
  const levels = await listLevels();
  let index = 0;
  levels.forEach((entry, position) => {
    if (xp >= entry.minXp) index = position;
  });
  const current = levels[index] ?? { level: 1, minXp: 0, title: "" };
  const next = levels[index + 1];
  return { level: current.level, title: current.title, minXp: current.minXp, nextLevelXp: next ? next.minXp : null };
}

/** Esquece a tabela em cache (depois de alterar os níveis). */
export function clearLevelsCache() {
  cache.clear();
}
