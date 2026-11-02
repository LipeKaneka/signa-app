import mongoose from "mongoose";

/**
 * Sessão do painel (coleção "adminSessions"). O navegador guarda só o token aleatório (cookie httpOnly);
 * aqui fica o SHA-256 dele, então um vazamento do banco não entrega sessões válidas.
 * expiresAt tem índice TTL: o MongoDB apaga as sessões vencidas sozinho.
 * Usado por: service-admin-auth.js.
 */
const adminSessionSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true, index: true },
    expiresAt: { type: Date, required: true },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null, maxlength: 300 },
  },
  { timestamps: true },
);

adminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AdminSessionModel = mongoose.model("AdminSession", adminSessionSchema, "adminSessions");
