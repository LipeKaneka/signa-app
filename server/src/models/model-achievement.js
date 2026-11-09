import mongoose from "mongoose";
import { ACHIEVEMENT_METRICS } from "../config/achievement-metrics.js";

/**
 * Conquista do catálogo (coleção "achievements"), editável pelo painel.
 * - key: identificador estável (ex.: "streak_7"); é o "id" que o app recebe.
 * - metric: o que é medido — só valores de ACHIEVEMENT_METRICS (cada métrica é um cálculo no código).
 * - goal: meta; desbloqueia quando métrica >= goal.
 * - active: false = desativada (some do app, continua no painel). order: posição na lista do perfil.
 * - secret: true = conquista secreta: no app, enquanto bloqueada, não mostra título, descrição nem progresso.
 * Usado por: service-achievement.js.
 */
const achievementSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, maxlength: 60, match: /^[a-z0-9_]+$/ },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, required: true, trim: true, maxlength: 200 },
    metric: { type: String, required: true, enum: ACHIEVEMENT_METRICS.map((metric) => metric.id) },
    goal: { type: Number, required: true, min: 1 },
    icon: { type: String, default: "medal", trim: true, maxlength: 40 },
    active: { type: Boolean, default: true },
    secret: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

achievementSchema.index({ active: 1, order: 1 });

export const AchievementModel = mongoose.model("Achievement", achievementSchema);
