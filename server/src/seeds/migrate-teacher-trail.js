import { ModuleModel } from "../models/model-module.js";
import { ActivityModel } from "../models/model-activity.js";

/** Slug do primeiro módulo da trilha antiga ("Alfabetização"). Se não existir, não há nada para migrar. */
const OLD_FIRST_MODULE = "alfabetizacao";
/** Unidade da trilha antiga que muda de módulo (vai para "Interação Pedagógica e Numerais"). */
const NUMBERS = { oldTitle: "Números", moduleSlug: "interacao-pedagogica", order: 1 };
/** Ordens usadas para "estacionar" o que fica desativado, longe das ordens da trilha nova. */
const PARKED_ORDER = 1000;

/**
 * Trilha para professores do Fundamental 1 (5 módulos) num banco que ainda tem a trilha antiga. Passo 1, ANTES de
 * criar o que falta (upsertTrail): o seed identifica as atividades pela ordem no módulo, então primeiro arruma as ordens.
 * - "Alfabetização" vira o módulo 1 ("Fundamentos"): as unidades de alfabeto que continuam vão para a ordem da trilha
 *   nova (mesmos documentos, então quem já fez continua com elas concluídas).
 * - "Números" vai para o módulo 3 (criado aqui, com os dados de trail.json).
 * - Vogais, Consoantes e a revisão antiga, e os módulos que saíram da trilha (inclusive os criados no painel),
 *   ficam desativados, sem apagar nada.
 * Pode rodar várias vezes: sem o módulo antigo, não faz nada.
 * @param {object[]} trail - módulos de data/trail.json (o primeiro é o novo módulo 1).
 * @returns {Promise<boolean>} true se migrou agora.
 * Usado por: seedContent, antes de upsertTrail.
 */
export async function moveToTeacherTrail(trail) {
  const oldModule = await ModuleModel.findOne({ slug: OLD_FIRST_MODULE }).lean();
  if (!oldModule) return false;
  const [first] = trail;
  const newOrders = new Map(first.activities.map((activity, index) => [activity.title, index + 1]));

  // 1) Tira todas as unidades do caminho (o índice módulo+ordem é único) e recoloca as que continuam.
  const activities = await ActivityModel.find({ module: oldModule._id }).sort({ order: -1 }).lean();
  for (const activity of activities) {
    await ActivityModel.updateOne({ _id: activity._id }, { $set: { order: PARKED_ORDER + activity.order } });
  }
  for (const activity of activities) {
    const order = newOrders.get(activity.title);
    if (order) await ActivityModel.updateOne({ _id: activity._id }, { $set: { order } });
    else if (activity.title !== NUMBERS.oldTitle) await ActivityModel.updateOne({ _id: activity._id }, { $set: { active: false } });
  }

  // 2) O módulo antigo vira o módulo 1 da trilha nova.
  await ModuleModel.updateOne(
    { _id: oldModule._id },
    { $set: { slug: first.slug, title: first.title, description: first.description ?? "", icon: first.icon, level: first.level, order: 1, prerequisite: null, active: true } },
  );

  // 3) "Números" vai para o módulo 3 (o pré-requisito dele é acertado depois, em linkTeacherTrail).
  const numbers = activities.find((activity) => activity.title === NUMBERS.oldTitle);
  if (numbers) {
    const target = trail.find((module) => module.slug === NUMBERS.moduleSlug);
    const position = trail.indexOf(target);
    const module = await ModuleModel.findOneAndUpdate(
      { slug: target.slug },
      { $setOnInsert: { slug: target.slug, title: target.title, description: target.description ?? "", icon: target.icon, level: target.level, order: position + 1, prerequisite: null } },
      { upsert: true, returnDocument: "after" },
    );
    await ActivityModel.updateOne(
      { _id: numbers._id },
      { $set: { module: module._id, order: NUMBERS.order, title: target.activities[NUMBERS.order - 1].title, active: true } },
    );
  }

  // 4) Módulos que não estão na trilha nova: desativados (somem do app; continuam no painel).
  const keep = new Set(trail.map((module) => module.slug));
  const others = await ModuleModel.find({ slug: { $nin: [...keep] } }).sort({ order: 1 }).select("_id").lean();
  for (const [index, module] of others.entries()) {
    await ModuleModel.updateOne({ _id: module._id }, { $set: { active: false, order: 100 + index } });
  }
  return true;
}

/**
 * Passo 2, DEPOIS de upsertTrail: o módulo 3 criado na migração exige o módulo 2 (o seed só define o pré-requisito ao
 * criar o módulo). Só mexe se estiver sem pré-requisito.
 * @param {object[]} trail
 * @returns {Promise<void>}
 */
export async function linkTeacherTrail(trail) {
  const position = trail.findIndex((module) => module.slug === NUMBERS.moduleSlug);
  if (position < 1) return;
  const previous = await ModuleModel.findOne({ slug: trail[position - 1].slug }).select("_id").lean();
  if (previous) await ModuleModel.updateOne({ slug: NUMBERS.moduleSlug, prerequisite: null }, { $set: { prerequisite: previous._id } });
}
