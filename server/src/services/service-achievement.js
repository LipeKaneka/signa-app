import { AchievementModel } from "../models/model-achievement.js";
import { DEFAULT_ACHIEVEMENTS } from "../config/achievements.js";
import { createTimedCache } from "../utils/util-timed-cache.js";
import { readCurrentStreak } from "./service-streak.js";

const CATALOG_CACHE_MS = 30 * 1000;
const cache = createTimedCache(CATALOG_CACHE_MS);

/**
 * Reúne os números do usuário que as conquistas medem (uma entrada por métrica de ACHIEVEMENT_METRICS).
 * @param {object} user - documento do usuário (UserModel).
 * @param {number} [completedModules=0] - módulos concluídos (vem de countCompletedModules, da trilha).
 * @returns {{streak: number, completedModules: number, totalCorrectAnswers: number, completedActivities: number, xp: number}}
 * streak usa o maior entre a ofensiva atual e a máxima (uma conquista de ofensiva não "some" se a ofensiva zerar).
 * Usado por: service-user.js (perfil) e service-attempt.js (antes/depois de concluir).
 * Para uma métrica nova: acrescente o campo aqui e em config/achievement-metrics.js. Veja docs/CONQUISTAS.md.
 */
export function readAchievementMetrics(user, completedModules = 0) {
  return {
    streak: Math.max(user.maxStreak, readCurrentStreak(user)),
    completedModules,
    totalCorrectAnswers: user.totalCorrectAnswers,
    completedActivities: user.completedActivitiesCount,
    xp: user.xp,
  };
}

/**
 * Catálogo de conquistas ATIVAS, em ordem (do banco; os padrões do código se a coleção estiver vazia).
 * @returns {Promise<{key: string, title: string, description: string, metric: string, goal: number, icon: string}[]>}
 */
export function listActiveAchievements() {
  return cache.get("catalog", async () => {
    const stored = await AchievementModel.find({ active: true }).sort({ order: 1, createdAt: 1 }).lean();
    if (stored.length > 0) return stored;
    const anyStored = await AchievementModel.exists({});
    if (anyStored) return []; // todas desativadas de propósito
    return DEFAULT_ACHIEVEMENTS.map(({ id, ...rest }) => ({ key: id, icon: "medal", ...rest }));
  });
}

/**
 * Todas as conquistas ativas com progresso limitado à meta e se foi desbloqueada.
 * @param {ReturnType<typeof readAchievementMetrics>} metrics
 * @returns {Promise<{id: string, title: string, description: string, icon: string, current: number, goal: number, unlocked: boolean}[]>}
 * Usado por: perfil (GET /profile) e findNewlyUnlocked.
 */
export async function listAchievementsWithProgress(metrics) {
  const catalog = await listActiveAchievements();
  return catalog.map((achievement) => {
    const current = Math.min(metrics[achievement.metric] ?? 0, achievement.goal);
    return {
      id: achievement.key,
      title: achievement.title,
      description: achievement.description,
      icon: achievement.icon,
      current,
      goal: achievement.goal,
      unlocked: current >= achievement.goal,
    };
  });
}

/**
 * Conquistas que passaram a valer entre dois momentos (ex.: antes e depois de concluir uma atividade).
 * Não guarda nada: compara as métricas, então é seguro chamar quantas vezes quiser.
 * @param {ReturnType<typeof readAchievementMetrics>} metricsBefore
 * @param {ReturnType<typeof readAchievementMetrics>} metricsAfter
 * @returns {Promise<{id: string, title: string}[]>}
 * Usado por: service-attempt.js (result.newAchievements na tela de resultado).
 */
export async function findNewlyUnlocked(metricsBefore, metricsAfter) {
  const before = await listAchievementsWithProgress(metricsBefore);
  const unlockedBefore = new Set(before.filter((achievement) => achievement.unlocked).map((achievement) => achievement.id));
  const after = await listAchievementsWithProgress(metricsAfter);
  return after
    .filter((achievement) => achievement.unlocked && !unlockedBefore.has(achievement.id))
    .map(({ id, title }) => ({ id, title }));
}

/**
 * Guarda a data das conquistas desbloqueadas que ainda não têm data (não grava no banco: quem chama salva).
 * Conquistas anteriores a este registro recebem a data em que foram vistas pela primeira vez.
 * @param {object} user - documento do usuário.
 * @param {{id: string, unlocked: boolean}[]} achievements - de listAchievementsWithProgress.
 * @param {Date} [now]
 * @returns {boolean} true se alguma data nova foi registrada (então é preciso salvar o usuário).
 * Usado por: finishAttempt e getProfileWithAchievements.
 */
export function recordUnlockDates(user, achievements, now = new Date()) {
  const known = new Set(user.achievementUnlocks.map((entry) => entry.key));
  const fresh = achievements.filter((achievement) => achievement.unlocked && !known.has(achievement.id));
  fresh.forEach((achievement) => user.achievementUnlocks.push({ key: achievement.id, unlockedAt: now }));
  return fresh.length > 0;
}

/**
 * Acrescenta unlockedAt (data do desbloqueio, ou null) a cada conquista.
 * @param {object} user
 * @param {object[]} achievements
 * @returns {object[]}
 */
export function withUnlockDates(user, achievements) {
  const dates = new Map(user.achievementUnlocks.map((entry) => [entry.key, entry.unlockedAt]));
  return achievements.map((achievement) => ({ ...achievement, unlockedAt: achievement.unlocked ? dates.get(achievement.id) ?? null : null }));
}

/** Esquece o catálogo em cache (depois de criar/alterar/desativar uma conquista). */
export function clearAchievementsCache() {
  cache.clear();
}
