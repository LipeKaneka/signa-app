import * as DictionaryAdmin from "../../services/service-admin-dictionary.js";
import { readActor } from "../../middlewares/admin-auth-middleware.js";
import { readRequiredString, readOptionalString, readBoolean, readPositiveInteger } from "../../utils/util-validators.js";

/**
 * Campos de um verbete. Ao criar, palavra e categoria são obrigatórias.
 * vlibrasGloss vazio = sem glosa (o avatar não toca nada).
 * @param {object} body
 * @param {boolean} creating
 * @returns {object}
 */
function readSignFields(body, creating) {
  const gloss = readOptionalString(body?.vlibrasGloss, "Glosa", 120);
  const fields = {
    word: creating ? readRequiredString(body?.word, "a palavra", 120) : readOptionalString(body?.word, "Palavra", 120) || undefined,
    category: creating ? readRequiredString(body?.category, "a categoria", 60) : readOptionalString(body?.category, "Categoria", 60) || undefined,
    description: readOptionalString(body?.description, "Descrição", 1000) ?? (creating ? "" : undefined),
    vlibrasGloss: gloss === undefined ? (creating ? null : undefined) : gloss.toUpperCase() || null,
    glossReviewed: readBoolean(body?.glossReviewed, "Glosa revisada") ?? (creating ? false : undefined),
  };
  if (!creating) fields.active = readBoolean(body?.active, "Ativo");
  return fields;
}

/** GET /admin/api/v1/signs?search=&category=&status=&page=&limit= — {signs, total, page, pages, categories}. */
export async function list(req, res) {
  const status = ["active", "inactive"].includes(req.query.status) ? req.query.status : undefined;
  res.json(
    await DictionaryAdmin.listSigns({
      search: readOptionalString(req.query.search, "Busca", 60),
      category: readOptionalString(req.query.category, "Categoria", 60),
      status,
      page: readPositiveInteger(req.query.page, { fallback: 1, max: 1000 }),
      limit: readPositiveInteger(req.query.limit, { fallback: 30, max: 100 }),
    }),
  );
}

/** POST /admin/api/v1/signs — {word, category, description?, vlibrasGloss?, glossReviewed?} → 201 {sign}. */
export async function create(req, res) {
  res.status(201).json({ sign: await DictionaryAdmin.createSign(readActor(req), readSignFields(req.body, true)) });
}

/** PATCH /admin/api/v1/signs/:slug — campos opcionais + active → {sign}. */
export async function update(req, res) {
  res.json({ sign: await DictionaryAdmin.updateSign(readActor(req), String(req.params.slug), readSignFields(req.body, false)) });
}

/** DELETE /admin/api/v1/signs/:slug — exclusão definitiva (desativado e sem uso). */
export async function remove(req, res) {
  await DictionaryAdmin.deleteSign(readActor(req), String(req.params.slug));
  res.json({ ok: true });
}
