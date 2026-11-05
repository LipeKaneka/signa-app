import mongoose from "mongoose";
import { ALWAYS_READONLY, EXPLORER_COLLECTIONS } from "../config/database-explorer.js";
import { AttemptModel } from "../models/model-attempt.js";
import { badRequest, conflict, notFound } from "../utils/util-http-error.js";
import { escapeRegExp } from "../utils/util-text.js";
import { recordAudit } from "./service-audit.js";
import { publishContentChange } from "./service-admin-publish.js";

const MAX_PAGE_SIZE = 100;
const MAX_EXPORT_DOCUMENTS = 5000;
/** Textos maiores que isso aparecem cortados na lista (o documento aberto mostra tudo). */
const LIST_TEXT_LIMIT = 160;

/** Coleção pelo nome da URL. @throws {HttpError} 404. */
function findCollection(key) {
  if (!Object.hasOwn(EXPLORER_COLLECTIONS, key)) throw notFound("Coleção não encontrada.");
  return { key, ...EXPLORER_COLLECTIONS[key] };
}

/** Campos escondidos da coleção (nunca saem do servidor). */
const hiddenFields = (collection) => new Set(collection.hidden ?? []);

/** Campos que a tela pode escrever: os do modelo, menos os fixos, escondidos e só leitura. */
function writableFields(collection) {
  const blocked = new Set([...ALWAYS_READONLY, ...(collection.hidden ?? []), ...(collection.readonly ?? [])]);
  return Object.keys(collection.model.schema.paths)
    .map((path) => path.split(".")[0])
    .filter((field, index, all) => all.indexOf(field) === index && !blocked.has(field));
}

/** Documento pronto para o painel: JSON puro, sem os campos escondidos. */
function toPlain(document, collection) {
  const plain = JSON.parse(JSON.stringify(document));
  hiddenFields(collection).forEach((field) => delete plain[field]);
  delete plain.__v;
  return plain;
}

/** Corta textos longos (lista) para a resposta não ficar pesada. */
function shortenForList(plain) {
  return Object.fromEntries(
    Object.entries(plain).map(([field, value]) => [field, typeof value === "string" && value.length > LIST_TEXT_LIMIT ? `${value.slice(0, LIST_TEXT_LIMIT)}…` : value]),
  );
}

/** Projeção que tira os campos escondidos já na consulta. */
const hiddenProjection = (collection) => Object.fromEntries([...hiddenFields(collection)].map((field) => [field, 0]));

/**
 * Lê e confere o que o painel quer gravar: só campos permitidos, sem operadores do MongoDB ($...) nem caminhos
 * com ponto (cada campo é trocado inteiro; listas e objetos vêm como JSON).
 * @param {unknown} changes
 * @param {object} collection
 * @returns {Record<string, unknown>}
 * @throws {HttpError} 400.
 */
function readChanges(changes, collection) {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) throw badRequest("Envie os campos a alterar.");
  const allowed = new Set(writableFields(collection));
  const entries = Object.entries(changes);
  if (entries.length === 0) throw badRequest("Nenhum campo alterado.");
  for (const [field] of entries) {
    if (field.startsWith("$") || field.includes(".")) throw badRequest(`Campo inválido: ${field}.`);
    if (!allowed.has(field)) throw badRequest(`O campo "${field}" não pode ser alterado aqui.`);
  }
  return Object.fromEntries(entries);
}

/** Converte erros do MongoDB/Mongoose em mensagens para o painel. */
function translateDatabaseError(error) {
  if (error instanceof mongoose.Error.ValidationError) {
    return badRequest(Object.values(error.errors).map((item) => `${item.path}: ${item.kind === "required" ? "obrigatório" : item.message}`).join(" · "));
  }
  if (error instanceof mongoose.Error.CastError) return badRequest(`Valor inválido em "${error.path}".`);
  if (error?.code === 11000) return conflict(`Já existe um documento com esse valor (${Object.keys(error.keyValue ?? {}).join(", ") || "campo único"}).`);
  return error;
}

async function afterWrite(collection) {
  if (collection.content) await publishContentChange();
}

/**
 * Coleções do explorador, com quantos documentos cada uma tem e o que a tela pode fazer nela.
 * @returns {Promise<object[]>}
 * Usado por: GET /admin/api/v1/database/collections.
 */
export async function listCollections() {
  return Promise.all(
    Object.entries(EXPLORER_COLLECTIONS).map(async ([key, collection]) => ({
      key,
      label: collection.label,
      count: await collection.model.estimatedDocumentCount(),
      editable: collection.editable,
      creatable: collection.creatable,
      deletable: collection.deletable,
      columns: collection.columns,
      writableFields: collection.editable || collection.creatable ? writableFields({ key, ...collection }) : [],
      note: collection.note ?? null,
    })),
  );
}

/**
 * Documentos de uma coleção, com busca (texto nos campos de busca, ou o _id exato) e paginação.
 * @param {string} key
 * @param {{search?: string, page: number, limit: number}} query
 * @returns {Promise<{documents: object[], total: number, page: number, pages: number}>}
 * Usado por: GET /admin/api/v1/database/collections/:key/documents.
 */
export async function listDocuments(key, { search = "", page = 1, limit = 25 }) {
  const collection = findCollection(key);
  const size = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
  let filter = {};
  const text = search.trim();
  if (text) {
    const pattern = { $regex: escapeRegExp(text), $options: "i" };
    const conditions = collection.search.map((field) => ({ [field]: pattern }));
    if (mongoose.isValidObjectId(text) && /^[0-9a-f]{24}$/i.test(text)) conditions.push({ _id: text });
    filter = conditions.length ? { $or: conditions } : { _id: null };
  }
  const [documents, total] = await Promise.all([
    collection.model.find(filter, hiddenProjection(collection)).sort(collection.sort).skip((page - 1) * size).limit(size).lean(),
    collection.model.countDocuments(filter),
  ]);
  return {
    documents: documents.map((document) => shortenForList(toPlain(document, collection))),
    total,
    page,
    pages: Math.max(Math.ceil(total / size), 1),
  };
}

/**
 * Um documento completo (sem os campos escondidos).
 * @returns {Promise<object>}
 * @throws {HttpError} 404.
 * Usado por: GET /admin/api/v1/database/collections/:key/documents/:id.
 */
export async function getDocument(key, id) {
  const collection = findCollection(key);
  if (!mongoose.isValidObjectId(id)) throw notFound("Documento não encontrado.");
  const document = await collection.model.findById(id, hiddenProjection(collection)).lean();
  if (!document) throw notFound("Documento não encontrado.");
  return toPlain(document, collection);
}

/**
 * Altera campos de um documento, com as validações do modelo, e registra antes/depois na auditoria.
 * @param {object} actor
 * @param {string} key
 * @param {string} id
 * @param {unknown} changes - {campo: valor novo}.
 * @returns {Promise<object>} documento atualizado.
 * @throws {HttpError} 400/403/404/409.
 * Usado por: PATCH /admin/api/v1/database/collections/:key/documents/:id.
 */
export async function updateDocument(actor, key, id, changes) {
  const collection = findCollection(key);
  if (!collection.editable) throw badRequest(collection.note ?? "Esta coleção é só leitura.");
  const fields = readChanges(changes, collection);
  if (!mongoose.isValidObjectId(id)) throw notFound("Documento não encontrado.");
  const document = await collection.model.findById(id);
  if (!document) throw notFound("Documento não encontrado.");

  const before = Object.fromEntries(Object.keys(fields).map((field) => [field, JSON.parse(JSON.stringify(document.get(field) ?? null))]));
  Object.entries(fields).forEach(([field, value]) => document.set(field, value));
  try {
    await document.save();
  } catch (error) {
    throw translateDatabaseError(error);
  }
  const after = Object.fromEntries(Object.keys(fields).map((field) => [field, JSON.parse(JSON.stringify(document.get(field) ?? null))]));
  await recordAudit(actor, {
    action: "update",
    entity: `database:${key}`,
    entityId: id,
    summary: `Banco de dados: alterou ${Object.keys(fields).join(", ")} em ${collection.label}`,
    before,
    after,
  });
  await afterWrite(collection);
  return getDocument(key, id);
}

/**
 * Cria um documento (só nas coleções que permitem), com as validações do modelo.
 * @returns {Promise<object>}
 * Usado por: POST /admin/api/v1/database/collections/:key/documents.
 */
export async function createDocument(actor, key, values) {
  const collection = findCollection(key);
  if (!collection.creatable) throw badRequest(collection.note ?? "Não é possível criar documentos nesta coleção por aqui.");
  const fields = readChanges(values, collection);
  let created;
  try {
    created = await collection.model.create(fields);
  } catch (error) {
    throw translateDatabaseError(error);
  }
  const plain = toPlain(created.toObject(), collection);
  await recordAudit(actor, { action: "create", entity: `database:${key}`, entityId: String(created._id), summary: `Banco de dados: criou em ${collection.label}`, after: plain });
  await afterWrite(collection);
  return plain;
}

/**
 * Exclui um documento para sempre (só nas coleções que permitem). Excluir um usuário apaga também as tentativas dele.
 * @throws {HttpError} 400/404.
 * Usado por: DELETE /admin/api/v1/database/collections/:key/documents/:id.
 */
export async function deleteDocument(actor, key, id) {
  const collection = findCollection(key);
  if (!collection.deletable) throw badRequest(collection.note ?? "Não é possível excluir documentos desta coleção por aqui.");
  if (!mongoose.isValidObjectId(id)) throw notFound("Documento não encontrado.");
  const document = await collection.model.findById(id, hiddenProjection(collection)).lean();
  if (!document) throw notFound("Documento não encontrado.");
  const before = toPlain(document, collection);

  await collection.model.deleteOne({ _id: id });
  let extra = "";
  if (key === "users") {
    const { deletedCount } = await AttemptModel.deleteMany({ user: id });
    extra = ` (e ${deletedCount} tentativas)`;
  }
  await recordAudit(actor, { action: "delete", entity: `database:${key}`, entityId: id, summary: `Banco de dados: excluiu de ${collection.label}${extra}`, before });
  await afterWrite(collection);
}

/** Valor de uma célula CSV (aspas quando precisa; objetos viram JSON). */
function toCsvCell(value) {
  const text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Exporta a coleção (até 5000 documentos, sem campos escondidos) em JSON ou CSV, e registra na auditoria.
 * @returns {Promise<{filename: string, contentType: string, body: string}>}
 * Usado por: GET /admin/api/v1/database/collections/:key/export?format=.
 */
export async function exportCollection(actor, key, format = "json") {
  const collection = findCollection(key);
  const documents = (await collection.model.find({}, hiddenProjection(collection)).sort(collection.sort).limit(MAX_EXPORT_DOCUMENTS).lean())
    .map((document) => toPlain(document, collection));
  const date = new Date().toISOString().slice(0, 10);
  await recordAudit(actor, { action: "export", entity: `database:${key}`, summary: `Banco de dados: exportou ${collection.label} (${documents.length}, ${format.toUpperCase()})` });
  if (format === "csv") {
    const fields = [...new Set(documents.flatMap((document) => Object.keys(document)))];
    const lines = [fields.join(","), ...documents.map((document) => fields.map((field) => toCsvCell(document[field])).join(","))];
    // BOM: o Excel abre os acentos certos.
    return { filename: `signa-${key}-${date}.csv`, contentType: "text/csv; charset=utf-8", body: `﻿${lines.join("\r\n")}` };
  }
  return { filename: `signa-${key}-${date}.json`, contentType: "application/json; charset=utf-8", body: JSON.stringify(documents, null, 2) };
}
