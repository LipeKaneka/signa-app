import mongoose from "mongoose";

/**
 * Papéis do painel, do mais poderoso para o menos. Cada rota administrativa exige um papel mínimo
 * (requireRole em admin-auth-middleware.js); a tabela de permissões está em docs/PAINEL-ADMIN.md.
 */
export const ADMIN_ROLES = Object.freeze(["owner", "admin", "editor", "viewer"]);

/**
 * Conta de administrador (coleção "admins"), separada dos usuários do app (admin não joga).
 * - passwordHash: bcrypt, nunca selecionado por padrão.
 * - status: "active" | "disabled" (desativado não entra; as sessões dele deixam de valer na hora).
 * O primeiro owner é criado pelo comando `npm run admin:create-owner`; os demais, pelo painel (só owner).
 * Usado por: service-admin-auth.js, service-admin-accounts.js.
 */
const adminSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ADMIN_ROLES, required: true },
    status: { type: String, enum: ["active", "disabled"], default: "active" },
    lastLogin: { type: Date, default: null },
  },
  { timestamps: true },
);

export const AdminModel = mongoose.model("Admin", adminSchema);
