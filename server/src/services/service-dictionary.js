import { SignModel } from "../models/model-sign.js";
import { notFound } from "../utils/util-http-error.js";
import { normalizeText, escapeRegExp } from "../utils/util-text.js";

/**
 * Verbete no formato da API (com avatar: {gloss, reviewed} quando houver glosa VLibras).
 * @param {object} sign - documento SignModel.
 * @returns {{slug, word, category, description, avatar, source}}
 */
export function toPublicSign(sign) {
  return {
    slug: sign.slug,
    word: sign.word,
    category: sign.category,
    description: sign.description,
    avatar: sign.vlibrasGloss ? { gloss: sign.vlibrasGloss, reviewed: sign.glossReviewed } : null,
    source: sign.source,
  };
}

/**
 * Filtro de busca: só verbetes ativos, por categoria e/ou pelo slug (busca sem acento).
 * @returns {object} filtro do Mongo.
 */
function buildSearchFilter(search, category) {
  const filter = { active: { $ne: false } };
  if (category) filter.category = category;
  const normalized = normalizeText(search);
  if (normalized) filter.slug = { $regex: escapeRegExp(normalized.replace(/\s+/g, "-")) };
  return filter;
}

/**
 * Lista paginada de verbetes, em ordem alfabética.
 * @param {{search?: string, category?: string, page: number, limit: number}} query
 * @returns {Promise<{signs: object[], total: number, page: number, pages: number}>}
 * Usado por: GET /dictionary.
 */
export async function listSigns({ search, category, page, limit }) {
  const filter = buildSearchFilter(search, category);
  const [signs, total] = await Promise.all([
    SignModel.find(filter).sort({ word: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    SignModel.countDocuments(filter),
  ]);
  return { signs: signs.map(toPublicSign), total, page, pages: Math.max(Math.ceil(total / limit), 1) };
}

/**
 * Categorias com verbetes ativos, em ordem alfabética (pt-BR).
 * @returns {Promise<string[]>}
 * Usado por: GET /dictionary/categories.
 */
export async function listCategories() {
  const categories = await SignModel.distinct("category", { active: { $ne: false } });
  return categories.sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/**
 * Um verbete pelo slug.
 * @param {string} slug - ex.: "bom-dia".
 * @returns {Promise<object>}
 * @throws {HttpError} 404 se não existir ou estiver desativado.
 */
export async function getSignBySlug(slug) {
  const sign = await SignModel.findOne({ slug, active: { $ne: false } }).lean();
  if (!sign) throw notFound("Sinal não encontrado no dicionário.");
  return toPublicSign(sign);
}

/**
 * Verbetes cujas palavras aparecem num texto livre.
 * @param {string} text
 * @param {number} [maxResults=5]
 * @returns {Promise<object[]>}
 * Usado por: GET /internal/v1/dictionary/mentioned (o assistente do backend cita esses sinais).
 */
export async function findSignsMentionedIn(text, maxResults = 5) {
  const words = new Set(normalizeText(text).split(/[^a-z0-9]+/).filter((word) => word.length >= 3));
  if (words.size === 0) return [];
  const signs = await SignModel.find({ slug: { $in: [...words] }, active: { $ne: false } }).limit(maxResults).lean();
  return signs.map(toPublicSign);
}
