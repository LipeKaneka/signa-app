import * as DatabaseService from "../../services/service-admin-database.js";
import { readActor } from "../../middlewares/admin-auth-middleware.js";
import { readOptionalString, readPositiveInteger } from "../../utils/util-validators.js";

/** GET /admin/api/v1/database/collections — coleções do explorador com contagem e permissões. */
export async function listCollections(_req, res) {
  res.json({ collections: await DatabaseService.listCollections() });
}

/** GET /admin/api/v1/database/collections/:key/documents?search=&page=&limit= — {documents, total, page, pages}. */
export async function listDocuments(req, res) {
  res.json(
    await DatabaseService.listDocuments(req.params.key, {
      search: readOptionalString(req.query.search, "Busca", 120) ?? "",
      page: readPositiveInteger(req.query.page, { fallback: 1, max: 100000 }),
      limit: readPositiveInteger(req.query.limit, { fallback: 25, max: 100 }),
    }),
  );
}

/** GET /admin/api/v1/database/collections/:key/documents/:id — {document}. */
export async function getDocument(req, res) {
  res.json({ document: await DatabaseService.getDocument(req.params.key, req.params.id) });
}

/** PATCH /admin/api/v1/database/collections/:key/documents/:id — {changes} → {document}. */
export async function updateDocument(req, res) {
  res.json({ document: await DatabaseService.updateDocument(readActor(req), req.params.key, req.params.id, req.body?.changes) });
}

/** POST /admin/api/v1/database/collections/:key/documents — {document} → 201 {document}. */
export async function createDocument(req, res) {
  res.status(201).json({ document: await DatabaseService.createDocument(readActor(req), req.params.key, req.body?.document) });
}

/** DELETE /admin/api/v1/database/collections/:key/documents/:id — exige {confirm: "EXCLUIR"}. */
export async function deleteDocument(req, res) {
  if (req.body?.confirm !== "EXCLUIR") {
    res.status(400).json({ error: "Para excluir, confirme digitando EXCLUIR." });
    return;
  }
  await DatabaseService.deleteDocument(readActor(req), req.params.key, req.params.id);
  res.json({ deleted: true });
}

/** GET /admin/api/v1/database/collections/:key/export?format=json|csv — arquivo para baixar. */
export async function exportCollection(req, res) {
  const format = req.query.format === "csv" ? "csv" : "json";
  const file = await DatabaseService.exportCollection(readActor(req), req.params.key, format);
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
  res.type(file.contentType).send(file.body);
}
