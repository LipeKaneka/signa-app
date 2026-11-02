import { AuditLogModel } from "../models/model-audit-log.js";

/** Campos que nunca entram na auditoria. */
const SECRET_FIELDS = new Set(["passwordHash", "password", "tokenHash", "__v"]);

/**
 * Cópia segura de um documento para a auditoria: JSON puro, sem senhas nem hashes.
 * @param {unknown} value - documento Mongoose, objeto ou null.
 * @returns {unknown}
 */
export function toAuditSnapshot(value) {
  if (value === null || value === undefined) return null;
  const plain = JSON.parse(JSON.stringify(typeof value.toObject === "function" ? value.toObject() : value));
  const strip = (node) => {
    if (Array.isArray(node)) return node.map(strip);
    if (node && typeof node === "object") {
      return Object.fromEntries(Object.entries(node).filter(([key]) => !SECRET_FIELDS.has(key)).map(([key, item]) => [key, strip(item)]));
    }
    return node;
  };
  return strip(plain);
}

/**
 * Grava um registro de auditoria. Falha ao gravar não desfaz a ação, mas fica no log do servidor.
 * @param {{admin?: object|null, ip?: string|null}} actor - quem fez (req.admin e req.ip).
 * @param {{action: string, entity: string, entityId?: unknown, summary?: string, before?: unknown, after?: unknown}} entry
 * @returns {Promise<void>}
 * Usado por: todos os services do painel e o login/logout.
 */
export async function recordAudit(actor, { action, entity, entityId = null, summary = "", before = null, after = null }) {
  try {
    await AuditLogModel.create({
      admin: actor.admin?._id ?? null,
      adminEmail: actor.admin?.email ?? null,
      action,
      entity,
      entityId: entityId === null ? null : String(entityId),
      summary: String(summary).slice(0, 300),
      before: toAuditSnapshot(before),
      after: toAuditSnapshot(after),
      ip: actor.ip ?? null,
    });
  } catch (error) {
    console.error("Falha ao gravar auditoria:", error.message);
  }
}

/**
 * Registros de auditoria, do mais novo para o mais antigo.
 * @param {{entity?: string, adminEmail?: string, page: number, limit: number}} query
 * @returns {Promise<{logs: object[], total: number, page: number, pages: number}>}
 * Usado por: GET /admin/api/v1/audit-log.
 */
export async function listAuditLogs({ entity, adminEmail, page, limit }) {
  const filter = {};
  if (entity) filter.entity = entity;
  if (adminEmail) filter.adminEmail = adminEmail.toLowerCase();
  const [logs, total] = await Promise.all([
    AuditLogModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLogModel.countDocuments(filter),
  ]);
  return {
    logs: logs.map(({ _id, admin, __v, ...log }) => ({ id: String(_id), adminId: admin ? String(admin) : null, ...log })),
    total,
    page,
    pages: Math.max(Math.ceil(total / limit), 1),
  };
}
