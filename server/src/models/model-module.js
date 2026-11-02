import mongoose from "mongoose";

/**
 * Módulo da trilha (coleção "modules"): título, descrição curta (cartão da trilha), ícone, nível e ordem de exibição.
 * prerequisite = módulo que precisa estar concluído antes (null = liberado desde o início).
 * active: false = desativado no painel (some do app; um pré-requisito desativado deixa de ser exigido).
 * Usado por: service-trail.js.
 */
const moduleSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: "", trim: true, maxlength: 200 },
    icon: { type: String, default: "🤟" },
    level: { type: Number, required: true, min: 1 },
    order: { type: Number, required: true },
    prerequisite: { type: mongoose.Schema.Types.ObjectId, ref: "Module", default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const ModuleModel = mongoose.model("Module", moduleSchema);
