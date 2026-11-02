import * as TrailAdmin from "../../services/service-admin-trail.js";
import { readActor } from "../../middlewares/admin-auth-middleware.js";
import { readRequiredString, readOptionalString, readBoolean, readInteger } from "../../utils/util-validators.js";
import { badRequest } from "../../utils/util-http-error.js";

const OBJECT_ID = /^[0-9a-f]{24}$/;

/**
 * Lê um id de documento (ou null quando permitido).
 * @throws {HttpError} 400.
 */
function readId(value, fieldLabel, { nullable = false } = {}) {
  if (nullable && (value === null || value === "")) return null;
  if (typeof value !== "string" || !OBJECT_ID.test(value)) throw badRequest(`${fieldLabel} inválido.`);
  return value;
}

/**
 * Perguntas sorteadas por tentativa: null/"" = todas; senão inteiro de 1 a 30.
 * @returns {number|null|undefined} undefined quando não veio no corpo.
 */
function readQuestionsPerAttempt(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return readInteger(value, "Perguntas por tentativa", { min: 1, max: 30 });
}

/**
 * Lê uma lista de ids (reordenação).
 * @throws {HttpError} 400.
 */
function readIdList(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) throw badRequest("Envie a lista de ids na ordem nova.");
  return value.map((id) => readId(id, "Id"));
}

/**
 * Campos de módulo. Ao criar, título e nível são obrigatórios.
 * @param {object} body
 * @param {boolean} creating
 * @returns {object}
 */
function readModuleFields(body, creating) {
  const fields = {
    title: creating ? readRequiredString(body?.title, "o título", 120) : readOptionalString(body?.title, "Título", 120) || undefined,
    description: readOptionalString(body?.description, "Descrição", 200) ?? (creating ? "" : undefined),
    icon: readOptionalString(body?.icon, "Ícone", 16) || (creating ? "🤟" : undefined),
    level: body?.level === undefined && !creating ? undefined : readInteger(body?.level, "Nível", { min: 1, max: 20 }),
    prerequisiteId: body?.prerequisiteId === undefined ? (creating ? null : undefined) : readId(body.prerequisiteId, "Pré-requisito", { nullable: true }),
  };
  if (!creating) fields.active = readBoolean(body?.active, "Ativo");
  return fields;
}

/** GET /admin/api/v1/modules — {modules}. */
export async function listModules(_req, res) {
  res.json({ modules: await TrailAdmin.listModules() });
}

/** POST /admin/api/v1/modules — {title, description?, icon?, level, prerequisiteId?} → 201 {module}. */
export async function createModule(req, res) {
  res.status(201).json({ module: await TrailAdmin.createModule(readActor(req), readModuleFields(req.body, true)) });
}

/** PATCH /admin/api/v1/modules/:id — {title?, description?, icon?, level?, prerequisiteId?, active?} → {module}. */
export async function updateModule(req, res) {
  res.json({ module: await TrailAdmin.updateModule(readActor(req), readId(req.params.id, "Módulo"), readModuleFields(req.body, false)) });
}

/** POST /admin/api/v1/modules/reorder — {ids} → {modules}. */
export async function reorderModules(req, res) {
  res.json({ modules: await TrailAdmin.reorderModules(readActor(req), readIdList(req.body?.ids)) });
}

/** DELETE /admin/api/v1/modules/:id — exclusão definitiva (desativado e sem atividades). */
export async function deleteModule(req, res) {
  await TrailAdmin.deleteModule(readActor(req), readId(req.params.id, "Módulo"));
  res.json({ ok: true });
}

/** GET /admin/api/v1/modules/:id/activities — {activities}. */
export async function listActivities(req, res) {
  res.json({ activities: await TrailAdmin.listActivities(readId(req.params.id, "Módulo")) });
}

/** POST /admin/api/v1/modules/:id/activities/reorder — {ids} → {activities}. */
export async function reorderActivities(req, res) {
  res.json({ activities: await TrailAdmin.reorderActivities(readActor(req), readId(req.params.id, "Módulo"), readIdList(req.body?.ids)) });
}

/** GET /admin/api/v1/activities/:id — {activity} com perguntas e gabarito. */
export async function getActivity(req, res) {
  res.json({ activity: await TrailAdmin.getActivity(readId(req.params.id, "Atividade")) });
}

/** POST /admin/api/v1/activities — {moduleId, title, description?, questions} → 201 {activity}. */
export async function createActivity(req, res) {
  const activity = await TrailAdmin.createActivity(readActor(req), {
    moduleId: readId(req.body?.moduleId, "Módulo"),
    title: readRequiredString(req.body?.title, "o título", 120),
    description: readOptionalString(req.body?.description, "Descrição", 200) ?? "",
    questionsPerAttempt: readQuestionsPerAttempt(req.body?.questionsPerAttempt) ?? null,
    questions: req.body?.questions,
  });
  res.status(201).json({ activity });
}

/** PATCH /admin/api/v1/activities/:id — {title?, description?, questions?, active?} → {activity}. */
export async function updateActivity(req, res) {
  const activity = await TrailAdmin.updateActivity(readActor(req), readId(req.params.id, "Atividade"), {
    title: readOptionalString(req.body?.title, "Título", 120) || undefined,
    description: readOptionalString(req.body?.description, "Descrição", 200),
    questionsPerAttempt: readQuestionsPerAttempt(req.body?.questionsPerAttempt),
    questions: req.body?.questions,
    active: readBoolean(req.body?.active, "Ativo"),
  });
  res.json({ activity });
}

/** DELETE /admin/api/v1/activities/:id — exclusão definitiva (só desativada). */
export async function deleteActivity(req, res) {
  await TrailAdmin.deleteActivity(readActor(req), readId(req.params.id, "Atividade"));
  res.json({ ok: true });
}
