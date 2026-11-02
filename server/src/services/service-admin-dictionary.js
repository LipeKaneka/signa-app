import { SignModel } from "../models/model-sign.js";
import { ActivityModel } from "../models/model-activity.js";
import { VLIBRAS_SOURCE } from "../config/sign-source.js";
import { slugify, normalizeText, escapeRegExp } from "../utils/util-text.js";
import { badRequest, conflict, notFound } from "../utils/util-http-error.js";
import { recordAudit } from "./service-audit.js";
import { publishContentChange } from "./service-admin-publish.js";
import { describeActiveChange } from "./service-admin-trail.js";

/**
 * Verbete no formato do painel (com status e se a glosa foi revisada).
 * @param {object} sign
 * @returns {object}
 */
function toAdminSign(sign) {
  return {
    slug: sign.slug,
    word: sign.word,
    category: sign.category,
    description: sign.description,
    vlibrasGloss: sign.vlibrasGloss,
    glossReviewed: sign.glossReviewed,
    active: sign.active !== false,
    source: sign.source,
    updatedAt: sign.updatedAt,
  };
}

/**
 * Verbetes (ativos e desativados), com busca sem acento, filtro por categoria e status.
 * @param {{search?: string, category?: string, status?: "active"|"inactive", page: number, limit: number}} query
 * @returns {Promise<{signs: object[], total: number, page: number, pages: number, categories: string[]}>}
 * Usado por: GET /admin/api/v1/signs.
 */
export async function listSigns({ search, category, status, page, limit }) {
  const filter = {};
  if (category) filter.category = category;
  if (status === "active") filter.active = { $ne: false };
  if (status === "inactive") filter.active = false;
  const normalized = normalizeText(search);
  if (normalized) filter.slug = { $regex: escapeRegExp(normalized.replace(/\s+/g, "-")) };
  const [signs, total, categories] = await Promise.all([
    SignModel.find(filter).sort({ word: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    SignModel.countDocuments(filter),
    SignModel.distinct("category"),
  ]);
  return {
    signs: signs.map(toAdminSign),
    total,
    page,
    pages: Math.max(Math.ceil(total / limit), 1),
    categories: categories.sort((a, b) => a.localeCompare(b, "pt-BR")),
  };
}

/**
 * Cria um verbete. O slug sai da palavra e não muda depois (é usado nas perguntas e na URL do app).
 * @param {object} actor
 * @param {{word: string, category: string, description: string, vlibrasGloss: string|null, glossReviewed: boolean}} data
 * @returns {Promise<object>}
 * @throws {HttpError} 409 se já existir verbete com o mesmo slug.
 * Usado por: POST /admin/api/v1/signs.
 */
export async function createSign(actor, data) {
  const slug = slugify(data.word);
  if (!slug) throw badRequest("Palavra inválida.");
  if (await SignModel.exists({ slug })) throw conflict(`Já existe o verbete "${slug}".`);
  const sign = await SignModel.create({ ...data, slug, source: VLIBRAS_SOURCE });
  await publishContentChange();
  await recordAudit(actor, { action: "create", entity: "sign", entityId: slug, summary: `Verbete "${data.word}"`, after: sign });
  return toAdminSign(sign);
}

/**
 * Edita um verbete (palavra, categoria, descrição, glosa, revisado, ativo).
 * @param {object} actor
 * @param {string} slug
 * @param {object} changes - já validado.
 * @returns {Promise<object>}
 * Usado por: PATCH /admin/api/v1/signs/:slug.
 */
export async function updateSign(actor, slug, changes) {
  const sign = await SignModel.findOne({ slug });
  if (!sign) throw notFound("Verbete não encontrado.");
  const before = sign.toObject();
  for (const field of ["word", "category", "description", "vlibrasGloss", "glossReviewed", "active"]) {
    if (changes[field] !== undefined) sign[field] = changes[field];
  }
  await sign.save();
  await publishContentChange();
  await recordAudit(actor, {
    action: describeActiveChange(before.active !== false, changes.active),
    entity: "sign",
    entityId: slug,
    summary: `Verbete "${sign.word}"`,
    before,
    after: sign,
  });
  return toAdminSign(sign);
}

/**
 * Exclusão definitiva: só desativado e sem uso em perguntas de atividades.
 * @param {object} actor
 * @param {string} slug
 * @returns {Promise<void>}
 * Usado por: DELETE /admin/api/v1/signs/:slug (papel admin).
 */
export async function deleteSign(actor, slug) {
  const sign = await SignModel.findOne({ slug });
  if (!sign) throw notFound("Verbete não encontrado.");
  if (sign.active !== false) throw badRequest("Desative o verbete antes de excluir.");
  if (await ActivityModel.exists({ "questions.sign": sign._id })) {
    throw badRequest("Este sinal é usado em perguntas de atividades. Troque as perguntas antes de excluir.");
  }
  await sign.deleteOne();
  await publishContentChange();
  await recordAudit(actor, { action: "delete", entity: "sign", entityId: slug, summary: `Verbete "${sign.word}"`, before: sign });
}
