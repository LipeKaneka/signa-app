import mongoose from "mongoose";
import { ACHIEVEMENT_EFFECTS } from "../config/achievement-appearance.js";

/**
 * Raridade de conquista (coleção "achievementtiers"), criada e ordenada pelo painel.
 * - key: identificador fixo usado em achievement.appearance.tier. label: nome no selo (ex.: "Lendária").
 * - order: posição na escala, da mais comum (menor) para a mais rara (maior).
 * - tagBackground/tagText: cores do selo no app. preset: cores e efeito sugeridos ao escolher a raridade numa conquista.
 * Usado por: service-achievement.js (app) e service-admin-gamification.js (painel).
 */
const tierSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, maxlength: 40, match: /^[a-z0-9_-]+$/ },
    label: { type: String, required: true, trim: true, maxlength: 30 },
    order: { type: Number, default: 0 },
    tagBackground: { type: String, default: "#ede4ff" },
    tagText: { type: String, default: "#4f31bb" },
    preset: {
      type: {
        _id: false,
        colorFrom: String,
        colorTo: String,
        accentColor: String,
        effect: { type: String, enum: ACHIEVEMENT_EFFECTS },
      },
      default: () => ({}),
    },
  },
  { timestamps: true },
);

tierSchema.index({ order: 1 });

export const AchievementTierModel = mongoose.model("AchievementTier", tierSchema);
