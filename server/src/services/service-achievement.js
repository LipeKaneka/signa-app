import { AchievementModel } from "../models/model-achievement.js";
import { SignModel } from "../models/model-sign.js";
import { DEFAULT_ACHIEVEMENTS } from "../config/achievements.js";
import { APP_EVENT_METRICS } from "../config/achievement-metrics.js";
import { createTimedCache } from "../utils/util-timed-cache.js";
import { readCurrentStreak } from "./service-streak.js";
import { countCompletedModules } from "./service-trail.js";

const CATALOG_CACHE_MS = 30 * 1000;
const cache = createTimedCache(CATALOG_CACHE_MS);

/** Total de sinais ativos do dicionário (para "% do dicionário visto"); muda pouco, então fica 30 s em cache. */
export function countActiveSigns() {
  return cache.get("active-signs", () => SignModel.countDocuments({ active: { $ne: false } }));
}

/**
 * Reúne os números do usuário que as conquistas medem (uma entrada por métrica de ACHIEVEMENT_METRICS).
 * @param {object} user - documento do usuário (UserModel).
 * @param {number} [completedModules=0] - módulos concluídos (vem de countCompletedModules, da trilha).
 * @param {number} [totalSigns=0] - sinais ativos do dicionário (vem de countActiveSigns).
 * @returns {Record<string, number>}
 * streak usa o maior entre a ofensiva atual e a máxima (uma conquista de ofensiva não "some" se a ofensiva zerar).
 * dictionaryPercent conta só sinais que ainda existem e arredonda para baixo (100 = viu todos).
 * Usado por: readUserAchievementMetrics (perfil, tentativas e ações do app).
 * Para uma métrica nova: acrescente o campo aqui e em config/achievement-metrics.js. Veja docs/CONQUISTAS.md.
 */
export function readAchievementMetrics(user, completedModules = 0, totalSigns = 0) {
  const viewedSigns = user.viewedSigns?.length ?? 0;
  const actions = Object.fromEntries(
    Object.entries(APP_EVENT_METRICS).map(([type, metric]) => [metric, user.actionCounts?.get?.(type) ?? 0]),
  );
  return {
    streak: Math.max(user.maxStreak, readCurrentStreak(user)),
    completedModules,
    totalCorrectAnswers: user.totalCorrectAnswers,
    completedActivities: user.completedActivitiesCount,
    perfectActivities: (user.completedActivities ?? []).filter((item) => item.bestScore >= 100).length,
    xp: user.xp,
    dictionarySignsViewed: viewedSigns,
    dictionaryPercent: totalSigns > 0 ? Math.floor((Math.min(viewedSigns, totalSigns) / totalSigns) * 100) : 0,
    ...actions,
  };
}

/**
 * readAchievementMetrics com os totais que vêm do banco (módulos concluídos e sinais do dicionário).
 * @param {object} user
 * @returns {Promise<Record<string, number>>}
 */
export async function readUserAchievementMetrics(user) {
  const [completedModules, totalSigns] = await Promise.all([countCompletedModules(user), countActiveSigns()]);
  return readAchievementMetrics(user, completedModules, totalSigns);
}

/**
 * Conquistas dadas/tiradas à mão pelo painel para este usuário.
 * @param {object} user
 * @returns {Map<string, boolean>} key -> true (dada) | false (tirada).
 * Usado por: perfil, fim de atividade e painel.
 */
export function readAchievementOverrides(user) {
  return new Map((user?.achievementOverrides ?? []).map((entry) => [entry.key, entry.unlocked]));
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
 * Ajuste manual do painel (overrides) vence a meta: dada = desbloqueada (progresso cheio); tirada = bloqueada.
 * @param {ReturnType<typeof readAchievementMetrics>} metrics
 * @param {Map<string, boolean>} [overrides] - de readAchievementOverrides.
 * @returns {Promise<{id: string, title: string, description: string, icon: string, current: number, goal: number,
 *   unlocked: boolean, manual: "granted"|"revoked"|null}[]>}
 * Usado por: perfil (GET /profile), findNewlyUnlocked e painel.
 */
export async function listAchievementsWithProgress(metrics, overrides = new Map()) {
  const catalog = await listActiveAchievements();
  return catalog.map((achievement) => {
    const override = overrides.get(achievement.key);
    const reached = Math.min(metrics[achievement.metric] ?? 0, achievement.goal);
    return {
      id: achievement.key,
      title: achievement.title,
      description: achievement.description,
      icon: achievement.icon,
      current: override === true ? achievement.goal : reached,
      goal: achievement.goal,
      unlocked: override ?? reached >= achievement.goal,
      manual: override === undefined ? null : override ? "granted" : "revoked",
      secret: achievement.secret === true,
    };
  });
}

/**
 * Conquistas que passaram a valer entre dois momentos (ex.: antes e depois de concluir uma atividade).
 * Não guarda nada: compara as métricas, então é seguro chamar quantas vezes quiser.
 * @param {ReturnType<typeof readAchievementMetrics>} metricsBefore
 * @param {ReturnType<typeof readAchievementMetrics>} metricsAfter
 * @param {Map<string, boolean>} [overrides] - ajustes manuais do painel (valem antes e depois).
 * @returns {Promise<{id: string, title: string}[]>}
 * Usado por: service-attempt.js (result.newAchievements na tela de resultado).
 */
export async function findNewlyUnlocked(metricsBefore, metricsAfter, overrides = new Map()) {
  const before = await listAchievementsWithProgress(metricsBefore, overrides);
  const unlockedBefore = new Set(before.filter((achievement) => achievement.unlocked).map((achievement) => achievement.id));
  const after = await listAchievementsWithProgress(metricsAfter, overrides);
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

/**
 * Para o app: conquista secreta ainda bloqueada vira "Conquista secreta", sem título, descrição nem progresso
 * (não dá para saber como desbloquear). Depois de desbloqueada aparece normal.
 * @param {object[]} achievements - de listAchievementsWithProgress / withUnlockDates.
 * @returns {object[]}
 * Usado por: GET /internal/v1/users/:userId/profile (o painel vê tudo).
 */
export function hideLockedSecrets(achievements) {
  return achievements.map((achievement) =>
    achievement.secret && !achievement.unlocked
      ? {
          id: achievement.id,
          title: "Conquista secreta",
          description: "Continue praticando para descobrir como desbloquear.",
          icon: "secret",
          current: null,
          goal: null,
          unlocked: false,
          secret: true,
          unlockedAt: null,
        }
      : achievement,
  );
}

/** Esquece o catálogo em cache (depois de criar/alterar/desativar uma conquista). */
export function clearAchievementsCache() {
  cache.clear();
}
