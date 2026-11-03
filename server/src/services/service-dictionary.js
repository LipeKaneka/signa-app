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

/** Palavras curtas comuns que não viram busca por "começa com" (achariam verbetes demais). */
const PREFIX_STOPWORDS = new Set(["como", "para", "qual", "quais", "onde", "quando", "porque", "fala", "falar", "fazer", "sinal", "libras"]);

/**
 * Verbetes citados num texto livre. Acha a palavra exata ("amor"), expressões de 2–3 palavras ("bom dia" → bom-dia),
 * plural simples ("cores" → cor) e palavras do mesmo começo com 3+ letras ("amo" → amor). Exatos vêm primeiro.
 * @param {string} text - pergunta do usuário ou termos que a IA escolheu (separados por vírgula ou espaço).
 * @param {number} [maxResults=5]
 * @param {{prefix?: boolean}} [options] - prefix: false = só palavras/expressões exatas (termos já escolhidos pela IA).
 * @returns {Promise<object[]>}
 * Usado por: GET /internal/v1/dictionary/mentioned (o assistente do backend cita esses sinais).
 */
export async function findSignsMentionedIn(text, maxResults = 5, { prefix = true } = {}) {
  const words = normalizeText(text).split(/[^a-z0-9]+/).filter(Boolean);
  const exact = new Set();
  words.forEach((word, index) => {
    if (word.length >= 3) exact.add(word);
    if (word.length >= 4 && word.endsWith("s")) exact.add(word.slice(0, -1));
    if (word.length >= 5 && word.endsWith("es")) exact.add(word.slice(0, -2));
    if (index + 1 < words.length) exact.add(`${word}-${words[index + 1]}`);
    if (index + 2 < words.length) exact.add(`${word}-${words[index + 1]}-${words[index + 2]}`);
  });
  if (exact.size === 0) return [];
  const prefixes = prefix ? [...new Set(words.filter((word) => word.length >= 3 && !PREFIX_STOPWORDS.has(word)))] : [];

  const active = { active: { $ne: false } };
  const exactSigns = await SignModel.find({ ...active, slug: { $in: [...exact] } }).limit(maxResults).lean();
  let signs = exactSigns;
  if (signs.length < maxResults && prefixes.length > 0) {
    const pattern = `^(${prefixes.map(escapeRegExp).join("|")})`;
    const found = new Set(signs.map((sign) => sign.slug));
    const similar = await SignModel.find({ ...active, slug: { $regex: pattern, $nin: [...found] } })
      .sort({ word: 1 })
      .limit(maxResults - signs.length)
      .lean();
    signs = [...signs, ...similar];
  }
  return signs.map(toPublicSign);
}
