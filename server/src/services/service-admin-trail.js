import { ModuleModel } from "../models/model-module.js";
import { ActivityModel, QUESTION_TYPES } from "../models/model-activity.js";
import { SignModel } from "../models/model-sign.js";
import { slugify } from "../utils/util-text.js";
import { badRequest, notFound } from "../utils/util-http-error.js";
import { recordAudit } from "./service-audit.js";
import { publishContentChange } from "./service-admin-publish.js";
import { CAMERA_CORRECT_OPTION, CAMERA_OPTIONS, findCameraTarget } from "../config/camera-targets.js";

const MAX_QUESTIONS = 30;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

/**
 * Ação de auditoria conforme o que mudou em "active".
 * @param {boolean} before
 * @param {boolean|undefined} after
 * @returns {string}
 */
export function describeActiveChange(before, after) {
  if (after === undefined || after === before) return "update";
  return after ? "activate" : "deactivate";
}

/**
 * Módulo no formato do painel.
 * @param {object} module
 * @param {object[]} activities - atividades do módulo (resumo).
 * @returns {object}
 */
function toAdminModule(module, activities) {
  return {
    id: String(module._id),
    slug: module.slug,
    title: module.title,
    description: module.description ?? "",
    icon: module.icon,
    level: module.level,
    order: module.order,
    prerequisiteId: module.prerequisite ? String(module.prerequisite) : null,
    active: module.active !== false,
    activityCount: activities.length,
    activeActivityCount: activities.filter((activity) => activity.active !== false).length,
  };
}

/**
 * Todos os módulos (ativos e desativados) em ordem, com a contagem de atividades.
 * @returns {Promise<object[]>}
 * Usado por: GET /admin/api/v1/modules.
 */
export async function listModules() {
  const [modules, activities] = await Promise.all([
    ModuleModel.find().sort({ order: 1 }).lean(),
    ActivityModel.find().select("module active").lean(),
  ]);
  return modules.map((module) =>
    toAdminModule(module, activities.filter((activity) => String(activity.module) === String(module._id))),
  );
}

/**
 * Slug ainda não usado, a partir do título ("Saudações" -> "saudacoes", "saudacoes-2"...).
 * @param {string} title
 * @returns {Promise<string>}
 */
async function generateModuleSlug(title) {
  const base = slugify(title) || "modulo";
  for (let suffix = 1; suffix < 100; suffix += 1) {
    const slug = suffix === 1 ? base : `${base}-${suffix}`;
    if (!(await ModuleModel.exists({ slug }))) return slug;
  }
  throw badRequest("Não foi possível gerar um identificador para este título.");
}

/**
 * Confere o pré-requisito: precisa existir e não pode formar ciclo (A exige B que exige A).
 * @param {string|null} prerequisiteId
 * @param {string|null} moduleId - módulo sendo editado (null ao criar).
 * @returns {Promise<object|null>} _id do pré-requisito ou null.
 * @throws {HttpError} 400.
 */
async function checkPrerequisite(prerequisiteId, moduleId) {
  if (!prerequisiteId) return null;
  const visited = new Set(moduleId ? [String(moduleId)] : []);
  let currentId = prerequisiteId;
  while (currentId) {
    if (visited.has(String(currentId))) throw badRequest("Esse pré-requisito criaria um ciclo entre módulos.");
    visited.add(String(currentId));
    const current = await ModuleModel.findById(currentId).select("prerequisite").lean();
    if (!current) throw badRequest("Módulo de pré-requisito não encontrado.");
    currentId = current.prerequisite;
  }
  return prerequisiteId;
}

/**
 * Cria um módulo no fim da trilha.
 * @param {object} actor - readActor(req).
 * @param {{title: string, description: string, icon: string, level: number, prerequisiteId: string|null}} data - já validado.
 * @returns {Promise<object>}
 * Usado por: POST /admin/api/v1/modules.
 */
export async function createModule(actor, { title, description, icon, level, prerequisiteId }) {
  const last = await ModuleModel.findOne().sort({ order: -1 }).select("order").lean();
  const module = await ModuleModel.create({
    slug: await generateModuleSlug(title),
    title,
    description,
    icon,
    level,
    order: (last?.order ?? 0) + 1,
    prerequisite: await checkPrerequisite(prerequisiteId, null),
  });
  await publishContentChange();
  await recordAudit(actor, { action: "create", entity: "module", entityId: module._id, summary: `Módulo "${title}"`, after: module });
  return toAdminModule(module.toObject(), []);
}

/**
 * Edita um módulo (título, descrição, ícone, nível, pré-requisito, ativo). O slug não muda (é o identificador estável).
 * @param {object} actor
 * @param {string} moduleId
 * @param {{title?, icon?, level?, prerequisiteId?, active?}} changes - já validado.
 * @returns {Promise<object>}
 * @throws {HttpError} 404, 400.
 * Usado por: PATCH /admin/api/v1/modules/:id.
 */
export async function updateModule(actor, moduleId, changes) {
  const module = await ModuleModel.findById(moduleId);
  if (!module) throw notFound("Módulo não encontrado.");
  const before = module.toObject();
  if (changes.title !== undefined) module.title = changes.title;
  if (changes.description !== undefined) module.description = changes.description;
  if (changes.icon !== undefined) module.icon = changes.icon;
  if (changes.level !== undefined) module.level = changes.level;
  if (changes.prerequisiteId !== undefined) module.prerequisite = await checkPrerequisite(changes.prerequisiteId, moduleId);
  if (changes.active !== undefined) module.active = changes.active;
  await module.save();
  await publishContentChange();
  await recordAudit(actor, {
    action: describeActiveChange(before.active !== false, changes.active),
    entity: "module",
    entityId: module._id,
    summary: `Módulo "${module.title}"`,
    before,
    after: module,
  });
  const activities = await ActivityModel.find({ module: module._id }).select("active").lean();
  return toAdminModule(module.toObject(), activities);
}

/**
 * Nova ordem dos módulos na trilha.
 * @param {object} actor
 * @param {string[]} moduleIds - TODOS os módulos, na ordem nova.
 * @returns {Promise<object[]>} lista atualizada.
 * @throws {HttpError} 400 se faltar ou sobrar algum.
 * Usado por: POST /admin/api/v1/modules/reorder.
 */
export async function reorderModules(actor, moduleIds) {
  const existing = await ModuleModel.find().select("_id order").lean();
  const sameSet = existing.length === moduleIds.length && existing.every((module) => moduleIds.includes(String(module._id)));
  if (!sameSet || new Set(moduleIds).size !== moduleIds.length) throw badRequest("Envie todos os módulos, cada um uma vez.");
  await ModuleModel.bulkWrite(moduleIds.map((id, index) => ({ updateOne: { filter: { _id: id }, update: { order: index + 1 } } })));
  await publishContentChange();
  await recordAudit(actor, { action: "reorder", entity: "module", summary: "Nova ordem dos módulos", before: existing, after: moduleIds });
  return listModules();
}

/**
 * Exclusão definitiva de um módulo: só desativado e sem atividades (exclua ou desative as atividades antes).
 * @param {object} actor
 * @param {string} moduleId
 * @returns {Promise<void>}
 * @throws {HttpError} 404, 400.
 * Usado por: DELETE /admin/api/v1/modules/:id (papel admin).
 */
export async function deleteModule(actor, moduleId) {
  const module = await ModuleModel.findById(moduleId);
  if (!module) throw notFound("Módulo não encontrado.");
  if (module.active !== false) throw badRequest("Desative o módulo antes de excluir.");
  if (await ActivityModel.exists({ module: module._id })) throw badRequest("Exclua as atividades deste módulo antes.");
  await ModuleModel.updateMany({ prerequisite: module._id }, { prerequisite: module.prerequisite ?? null });
  await module.deleteOne();
  await publishContentChange();
  await recordAudit(actor, { action: "delete", entity: "module", entityId: moduleId, summary: `Módulo "${module.title}"`, before: module });
}

/**
 * Atividade no formato do painel (com gabarito: o painel precisa editar).
 * @param {object} activity - com questions.sign populado.
 * @param {boolean} [withQuestions=true]
 * @returns {object}
 */
function toAdminActivity(activity, withQuestions = true) {
  const summary = {
    id: String(activity._id),
    moduleId: String(activity.module),
    title: activity.title,
    description: activity.description ?? "",
    order: activity.order,
    active: activity.active !== false,
    questionCount: activity.questions.length,
    questionsPerAttempt: activity.questionsPerAttempt ?? null,
  };
  if (!withQuestions) return summary;
  return {
    ...summary,
    questions: activity.questions.map((question) => ({
      key: question.key,
      type: question.type,
      prompt: question.prompt,
      sign: question.sign ? { slug: question.sign.slug, word: question.sign.word, gloss: question.sign.vlibrasGloss } : null,
      options: question.options,
      correctOptionId: question.correctOptionId,
      explanation: question.explanation,
      target: question.target ?? null,
    })),
  };
}

/**
 * Atividades de um módulo (resumo), em ordem.
 * @param {string} moduleId
 * @returns {Promise<object[]>}
 * Usado por: GET /admin/api/v1/modules/:id/activities.
 */
export async function listActivities(moduleId) {
  if (!(await ModuleModel.exists({ _id: moduleId }))) throw notFound("Módulo não encontrado.");
  const activities = await ActivityModel.find({ module: moduleId }).select("module title description order active questionsPerAttempt questions.key").sort({ order: 1 }).lean();
  return activities.map((activity) => toAdminActivity(activity, false));
}

/**
 * Uma atividade completa (perguntas, alternativas e gabarito).
 * @param {string} activityId
 * @returns {Promise<object>}
 * @throws {HttpError} 404.
 * Usado por: GET /admin/api/v1/activities/:id.
 */
export async function getActivity(activityId) {
  const activity = await ActivityModel.findById(activityId).populate("questions.sign", "slug word vlibrasGloss").lean();
  if (!activity) throw notFound("Atividade não encontrada.");
  return toAdminActivity(activity);
}

/**
 * Valida e monta as perguntas enviadas pelo painel.
 * Formato de cada uma: {key?, type, prompt, signSlug?, options: [{id, text}], correctOptionId, explanation?}.
 * camera_sign: {type, prompt, target, signSlug?, explanation?}; target tem que estar em CAMERA_TARGETS e as
 * alternativas são fixas (o painel não precisa mandá-las).
 * @param {unknown} questions
 * @returns {Promise<object[]>} perguntas no formato do ActivityModel.
 * @throws {HttpError} 400 com a pergunta e o problema.
 */
export async function readQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0 || questions.length > MAX_QUESTIONS) {
    throw badRequest(`A atividade precisa ter de 1 a ${MAX_QUESTIONS} perguntas.`);
  }
  const keys = new Set();
  const result = [];
  for (const [index, question] of questions.entries()) {
    const label = `Pergunta ${index + 1}`;
    if (!question || typeof question !== "object") throw badRequest(`${label}: formato inválido.`);
    const key = typeof question.key === "string" && /^[a-z0-9_-]{1,30}$/i.test(question.key) ? question.key : `q${index + 1}`;
    if (keys.has(key)) throw badRequest(`${label}: identificador "${key}" repetido.`);
    keys.add(key);
    if (!QUESTION_TYPES.includes(question.type)) throw badRequest(`${label}: tipo inválido.`);
    const prompt = typeof question.prompt === "string" ? question.prompt.trim() : "";
    if (!prompt || prompt.length > 500) throw badRequest(`${label}: enunciado de 1 a 500 caracteres.`);

    const explanationText = typeof question.explanation === "string" ? question.explanation.trim() : "";
    if (explanationText.length > 1000) throw badRequest(`${label}: explicação de até 1000 caracteres.`);
    if (question.type === "camera_sign") {
      const target = findCameraTarget(question.target);
      if (!target) throw badRequest(`${label}: escolha um sinal que a câmera reconhece.`);
      // Avatar opcional: o sinal escolhido no painel ou, se não vier, o verbete do dicionário com o mesmo nome.
      const slug = question.signSlug ? String(question.signSlug) : slugify(target.label);
      const found = await SignModel.findOne({ slug }).select("_id").lean();
      result.push({
        key,
        type: "camera_sign",
        prompt,
        sign: found?._id ?? null,
        target: target.label,
        options: CAMERA_OPTIONS.map((option) => ({ ...option })),
        correctOptionId: CAMERA_CORRECT_OPTION,
        explanation: explanationText,
      });
      continue;
    }

    let sign = null;
    if (question.type === "sign_choice") {
      const found = await SignModel.findOne({ slug: String(question.signSlug ?? "") }).select("_id").lean();
      if (!found) throw badRequest(`${label}: escolha um sinal do dicionário.`);
      sign = found._id;
    }

    const options = Array.isArray(question.options) ? question.options : [];
    if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
      throw badRequest(`${label}: de ${MIN_OPTIONS} a ${MAX_OPTIONS} alternativas.`);
    }
    const optionIds = new Set();
    const cleanOptions = options.map((option, optionIndex) => {
      const id = typeof option?.id === "string" && /^[a-z0-9]{1,10}$/i.test(option.id) ? option.id : String.fromCharCode(97 + optionIndex);
      const text = typeof option?.text === "string" ? option.text.trim() : "";
      if (!text || text.length > 200) throw badRequest(`${label}: alternativa ${optionIndex + 1} precisa de 1 a 200 caracteres.`);
      if (optionIds.has(id)) throw badRequest(`${label}: alternativas com o mesmo identificador.`);
      optionIds.add(id);
      return { id, text };
    });
    if (!optionIds.has(question.correctOptionId)) throw badRequest(`${label}: marque a alternativa correta.`);
    const explanation = typeof question.explanation === "string" ? question.explanation.trim() : "";
    if (explanation.length > 1000) throw badRequest(`${label}: explicação de até 1000 caracteres.`);

    result.push({ key, type: question.type, prompt, sign, options: cleanOptions, correctOptionId: question.correctOptionId, explanation });
  }
  return result;
}

/**
 * Cria uma atividade no fim do módulo.
 * @param {object} actor
 * @param {{moduleId: string, title: string, description: string, questions: unknown}} data
 * @returns {Promise<object>}
 * Usado por: POST /admin/api/v1/activities.
 */
export async function createActivity(actor, { moduleId, title, description, questionsPerAttempt = null, questions }) {
  if (!(await ModuleModel.exists({ _id: moduleId }))) throw badRequest("Módulo não encontrado.");
  const cleanQuestions = await readQuestions(questions);
  const last = await ActivityModel.findOne({ module: moduleId }).sort({ order: -1 }).select("order").lean();
  const activity = await ActivityModel.create({ module: moduleId, title, description, questionsPerAttempt, order: (last?.order ?? 0) + 1, questions: cleanQuestions });
  await publishContentChange();
  await recordAudit(actor, { action: "create", entity: "activity", entityId: activity._id, summary: `Atividade "${title}"`, after: activity });
  return getActivity(activity._id);
}

/**
 * Edita título, descrição, perguntas ou ativo de uma atividade. Tentativas em andamento continuam com as respostas já dadas.
 * @param {object} actor
 * @param {string} activityId
 * @param {{title?: string, description?: string, questions?: unknown, active?: boolean}} changes
 * @returns {Promise<object>}
 * Usado por: PATCH /admin/api/v1/activities/:id.
 */
export async function updateActivity(actor, activityId, changes) {
  const activity = await ActivityModel.findById(activityId);
  if (!activity) throw notFound("Atividade não encontrada.");
  const before = activity.toObject();
  if (changes.title !== undefined) activity.title = changes.title;
  if (changes.description !== undefined) activity.description = changes.description;
  if (changes.questionsPerAttempt !== undefined) activity.questionsPerAttempt = changes.questionsPerAttempt;
  if (changes.questions !== undefined) activity.questions = await readQuestions(changes.questions);
  if (changes.active !== undefined) activity.active = changes.active;
  await activity.save();
  await publishContentChange();
  await recordAudit(actor, {
    action: describeActiveChange(before.active !== false, changes.active),
    entity: "activity",
    entityId: activity._id,
    summary: `Atividade "${activity.title}"`,
    before,
    after: activity,
  });
  return getActivity(activity._id);
}

/**
 * Nova ordem das atividades de um módulo (em duas fases, por causa do índice único módulo+ordem).
 * @param {object} actor
 * @param {string} moduleId
 * @param {string[]} activityIds - TODAS as atividades do módulo, na ordem nova.
 * @returns {Promise<object[]>}
 * Usado por: POST /admin/api/v1/modules/:id/activities/reorder.
 */
export async function reorderActivities(actor, moduleId, activityIds) {
  const existing = await ActivityModel.find({ module: moduleId }).select("_id order").lean();
  const sameSet = existing.length === activityIds.length && existing.every((activity) => activityIds.includes(String(activity._id)));
  if (!sameSet || new Set(activityIds).size !== activityIds.length) throw badRequest("Envie todas as atividades do módulo, cada uma uma vez.");
  await ActivityModel.bulkWrite(activityIds.map((id, index) => ({ updateOne: { filter: { _id: id }, update: { order: -(index + 1) } } })));
  await ActivityModel.bulkWrite(activityIds.map((id, index) => ({ updateOne: { filter: { _id: id }, update: { order: index + 1 } } })));
  await publishContentChange();
  await recordAudit(actor, { action: "reorder", entity: "activity", entityId: moduleId, summary: "Nova ordem das atividades", before: existing, after: activityIds });
  return listActivities(moduleId);
}

/**
 * Exclusão definitiva de uma atividade (só desativada). O histórico de tentativas continua no banco.
 * @param {object} actor
 * @param {string} activityId
 * @returns {Promise<void>}
 * Usado por: DELETE /admin/api/v1/activities/:id (papel admin).
 */
export async function deleteActivity(actor, activityId) {
  const activity = await ActivityModel.findById(activityId);
  if (!activity) throw notFound("Atividade não encontrada.");
  if (activity.active !== false) throw badRequest("Desative a atividade antes de excluir.");
  await activity.deleteOne();
  await publishContentChange();
  await recordAudit(actor, { action: "delete", entity: "activity", entityId: activityId, summary: `Atividade "${activity.title}"`, before: activity });
}
