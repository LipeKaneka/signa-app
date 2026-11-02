import mongoose from "mongoose";

/**
 * Nível (coleção "levels"): a partir de minXp de XP o usuário está neste nível.
 * O nível NÃO é gravado no usuário: é calculado pelo XP (mudar a tabela vale na hora para todos).
 * Usado por: service-level.js.
 */
const levelSchema = new mongoose.Schema(
  {
    level: { type: Number, required: true, unique: true, min: 1 },
    minXp: { type: Number, required: true, min: 0 },
    title: { type: String, required: true, trim: true, maxlength: 60 },
  },
  { timestamps: true },
);

export const LevelModel = mongoose.model("Level", levelSchema);
