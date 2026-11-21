import { ModuleModel } from "../models/model-module.js";
import { ActivityModel } from "../models/model-activity.js";
import { notFound, forbidden } from "../utils/util-http-error.js";
import { createTimedCache } from "../utils/util-timed-cache.js";
import { MESSAGES } from "../config/messages.js";

/**
 * Mapa activityId -> melhor nota do usuário (atividades aprovadas).
 * @param {object} user
 * @returns {Map<string, number>}
 */
function readBestScores(user) {
  return new Map(user.completedActivities.map((entry) => [String(entry.activity), entry.bestScore]));
}

/** Filtro "não desativado no painel" (documentos antigos não têm o campo active). */
const NOT_DEACTIVATED = Object.freeze({ active: { $ne: false } });

/**
 * Módulos e atividades são iguais para todo mundo e só mudam pelo painel (que limpa o cache em publishContentChange)
 * ou pelo seed. Antes eram lidos do banco em cada /trail, ao começar uma atividade e em cada cálculo de conquistas
 * (a cada acerto e duas vezes ao concluir). A validade é só uma garantia para mudanças feitas fora do servidor.
 */
const CONTENT_CACHE_MS = 60 * 1000;
const contentCache = createTimedCache(CONTENT_CACHE_MS);

/**
 * Carrega módulos ativos (por ordem) com suas atividades ativas (sem o conteúdo das perguntas, só as chaves).
 * Módulos sem nenhuma atividade ativa também vêm (o app mostra "em breve"), mas não travam o próximo (veja buildTrail).
 * O resultado é compartilhado (cache): quem usa só lê, nunca altera.
 * @returns {Promise<{module: object, activities: object[]}[]>}
 */
function loadModulesWithActivities() {
  return contentCache.get("modules", async () => {
    const [modules, activities] = await Promise.all([
      ModuleModel.find(NOT_DEACTIVATED).sort({ order: 1 }).lean(),
      ActivityModel.find(NOT_DEACTIVATED).select("module order title description questionsPerAttempt questions.key").sort({ order: 1 }).lean(),
    ]);
    const activitiesByModule = new Map();
    for (const activity of activities) {
      const key = String(activity.module);
      if (!activitiesByModule.has(key)) activitiesByModule.set(key, []);
      activitiesByModule.get(key).push(activity);
    }
    return modules.map((module) => ({ module, activities: activitiesByModule.get(String(module._id)) ?? [] }));
  });
}

/**
 * Atividade completa (perguntas com gabarito), sem os dados do sinal. Fica em cache: cada resposta precisa dela.
 * O resultado é compartilhado: quem usa só lê.
 * @param {string} activityId
 * @returns {Promise<object|null>}
 * Usado por: service-attempt.js (correção de cada resposta e nota no fim).
 */
export function findActivityForGrading(activityId) {
  return contentCache.get(`activity:${activityId}`, () => ActivityModel.findById(activityId).lean());
}

/** Esquece a trilha e as atividades em cache (depois de mudar o conteúdo no painel ou no seed). */
export function clearTrailCache() {
  contentCache.clear();
}

/**
 * Status de cada atividade de um módulo: completed, available ou locked.
 * Regra: dentro do módulo, cada atividade libera a seguinte; nada fica liberado se o módulo estiver bloqueado.
 * @param {object[]} activities
 * @param {Map<string, number>} bestScores
 * @param {boolean} moduleIsOpen
 * @returns {{id: string, title: string, description: string, order: number, questionCount: number, status: string, bestScore: number|null}[]}
 */
function describeActivities(activities, bestScores, moduleIsOpen) {
  let previousCompleted = true;
  return activities.map((activity) => {
    const bestScore = bestScores.get(String(activity._id)) ?? null;
    const completed = bestScore !== null;
    const status = completed ? "completed" : moduleIsOpen && previousCompleted ? "available" : "locked";
    previousCompleted = completed;
    return {
      id: String(activity._id),
      title: activity.title,
      description: activity.description ?? "",
      order: activity.order,
      questionCount: Math.min(activity.questionsPerAttempt ?? activity.questions.length, activity.questions.length),
      status,
      bestScore,
    };
  });
}

/**
 * Monta a trilha completa do usuário. Um módulo é liberado quando o pré-requisito foi concluído
 * (pré-requisito desativado, fora da trilha ou sem atividades não é exigido) e é concluído quando todas as suas atividades
 * ativas foram aprovadas.
 * @param {object} user
 * @returns {Promise<{id, slug, title, description, icon, level, status, completedActivities, totalActivities, activities}[]>}
 * Usado por: GET /trail, countCompletedModules e findUnlockedActivity.
 */
export async function buildTrail(user) {
  const bestScores = readBestScores(user);
  const entries = await loadModulesWithActivities();
  const completedModuleIds = new Set();
  // Só módulos com atividades contam como pré-requisito: um módulo vazio (ex.: "Treino com a câmera") não trava o seguinte.
  const requirableModuleIds = new Set(entries.filter(({ activities }) => activities.length > 0).map(({ module }) => String(module._id)));

  return entries.map(({ module, activities }) => {
    const prerequisite = module.prerequisite ? String(module.prerequisite) : null;
    const prerequisiteDone = !prerequisite || !requirableModuleIds.has(prerequisite) || completedModuleIds.has(prerequisite);
    const describedActivities = describeActivities(activities, bestScores, prerequisiteDone);
    const completedCount = describedActivities.filter((a) => a.status === "completed").length;
    const isCompleted = activities.length > 0 && completedCount === activities.length;
    if (isCompleted) completedModuleIds.add(String(module._id));

    return {
      id: String(module._id),
      slug: module.slug,
      title: module.title,
      description: module.description ?? "",
      icon: module.icon,
      level: module.level,
      status: isCompleted ? "completed" : prerequisiteDone ? "available" : "locked",
      completedActivities: completedCount,
      totalActivities: activities.length,
      activities: describedActivities,
    };
  });
}

/**
 * Quantos módulos o usuário concluiu.
 * @param {object} user
 * @returns {Promise<number>}
 * Usado por: conquistas (métrica completedModules) no perfil e no fim da atividade.
 */
export async function countCompletedModules(user) {
  const trail = await buildTrail(user);
  return trail.filter((module) => module.status === "completed").length;
}

/**
 * Busca a atividade (com os sinais das perguntas) e garante que está liberada para o usuário.
 * @param {object} user
 * @param {string} activityId
 * @returns {Promise<{activity: object, alreadyCompleted: boolean}>}
 * @throws {HttpError} 404 se não existir; 403 se ainda estiver bloqueada.
 * Usado por: service-attempt.js (startAttempt).
 */
export async function findUnlockedActivity(user, activityId) {
  const activity = await ActivityModel.findById(activityId).populate("questions.sign");
  if (!activity) throw notFound(MESSAGES.attempt.activityNotFound);

  const trail = await buildTrail(user);
  const trailActivity = trail.flatMap((module) => module.activities).find((a) => a.id === String(activity._id));
  if (!trailActivity || trailActivity.status === "locked") {
    throw forbidden(MESSAGES.attempt.activityLocked);
  }
  return { activity, alreadyCompleted: trailActivity.status === "completed" };
}
