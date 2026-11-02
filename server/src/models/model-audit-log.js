import mongoose from "mongoose";

/**
 * Registro de auditoria (coleção "auditLogs"): quem mudou o quê, quando e de onde.
 * - action: "create" | "update" | "activate" | "deactivate" | "delete" | "login" | "logout" | ... (texto livre curto).
 * - entity: tipo do que mudou ("module", "activity", "sign", "achievement", "event", "level", "setting", "user",
 *   "admin", "database"). entityId: id ou chave do item.
 * - before/after: cópia do item antes e depois (sem senhas). adminEmail fica gravado para o histórico
 *   continuar legível mesmo se a conta do admin mudar.
 * Nunca é editado nem apagado pelo painel.
 * Usado por: service-audit.js.
 */
const auditLogSchema = new mongoose.Schema(
  {
    admin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    adminEmail: { type: String, default: null },
    action: { type: String, required: true, maxlength: 40 },
    entity: { type: String, required: true, maxlength: 40 },
    entityId: { type: String, default: null, maxlength: 120 },
    summary: { type: String, default: "", maxlength: 300 },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    ip: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entity: 1, createdAt: -1 });

export const AuditLogModel = mongoose.model("AuditLog", auditLogSchema, "auditLogs");
