import * as DictionaryService from "../services/service-dictionary.js";
import { readOptionalString, readPositiveInteger } from "../utils/util-validators.js";

/** GET /internal/v1/dictionary?search=&category=&page=&limit= — {signs, total, page, pages}. */
export async function listSigns(req, res) {
  res.json(
    await DictionaryService.listSigns({
      search: readOptionalString(req.query.search, "Busca", 60),
      category: readOptionalString(req.query.category, "Categoria", 60),
      page: readPositiveInteger(req.query.page, { fallback: 1, max: 1000 }),
      limit: readPositiveInteger(req.query.limit, { fallback: 30, max: 100 }),
    }),
  );
}

/** GET /internal/v1/dictionary/categories — {categories}. */
export async function listCategories(_req, res) {
  res.json({ categories: await DictionaryService.listCategories() });
}

/** GET /internal/v1/dictionary/signs/:slug — {sign}. */
export async function getSign(req, res) {
  res.json({ sign: await DictionaryService.getSignBySlug(req.params.slug) });
}

/** GET /internal/v1/dictionary/mentioned?text=&limit= — {signs} citados no texto (assistente). */
export async function findMentioned(req, res) {
  const text = readOptionalString(req.query.text, "Texto", 2000) ?? "";
  const limit = readPositiveInteger(req.query.limit, { fallback: 5, max: 20 });
  res.json({ signs: await DictionaryService.findSignsMentionedIn(text, limit) });
}
