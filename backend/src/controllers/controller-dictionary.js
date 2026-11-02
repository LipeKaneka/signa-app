import * as DictionaryService from "../services/service-dictionary.js";
import { readOptionalString, readPositiveInteger } from "../utils/util-validators.js";

/**
 * GET /dictionary?search=&category=&page=&limit= — responde {signs, total, page, pages}.
 */
export async function listSigns(req, res) {
  const result = await DictionaryService.listSigns({
    search: readOptionalString(req.query.search, "Busca", 60),
    category: readOptionalString(req.query.category, "Categoria", 60),
    page: readPositiveInteger(req.query.page, { fallback: 1, max: 1000 }),
    limit: readPositiveInteger(req.query.limit, { fallback: 30, max: 100 }),
  });
  res.json(result);
}

/**
 * GET /dictionary/categories — responde {categories}.
 */
export async function listCategories(_req, res) {
  const categories = await DictionaryService.listCategories();
  res.json({ categories });
}

/**
 * GET /dictionary/:slug — responde {sign}.
 */
export async function getSign(req, res) {
  const sign = await DictionaryService.getSignBySlug(req.params.slug);
  res.json({ sign });
}
