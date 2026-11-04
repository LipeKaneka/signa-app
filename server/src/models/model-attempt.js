import mongoose from "mongoose";

/**
 * Resposta dada numa tentativa, já corrigida no servidor.
 */
const answerSchema = new mongoose.Schema(
  {
    questionKey: { type: String, required: true },
    optionId: { type: String, required: true },
    correct: { type: Boolean, required: true },
    // Pergunta de câmera pulada porque o aparelho não tinha câmera/permissão: não entra na nota.
    skipped: { type: Boolean, default: false },
    answeredAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

/**
 * Tentativa de uma atividade (coleção "attempts"): in_progress -> finished | expired.
 * answers guarda as respostas corrigidas; result é preenchido ao encerrar (nota, XP, conquistas novas).
 * Histórico útil para estatísticas e para conquistas futuras (ex.: "10 atividades perfeitas").
 */
const attemptSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    activity: { type: mongoose.Schema.Types.ObjectId, ref: "Activity", required: true },
    status: { type: String, enum: ["in_progress", "finished", "expired"], default: "in_progress" },
    answers: { type: [answerSchema], default: [] },
    // Perguntas desta tentativa, na ordem mostrada (sorteadas quando a atividade tem questionsPerAttempt).
    questionKeys: { type: [String], default: undefined },
    expiresAt: { type: Date, required: true },
    result: {
      correctAnswers: Number,
      totalQuestions: Number,
      score: Number,
      passed: Boolean,
      xpEarned: Number,
      xpMultiplier: Number,
      newAchievements: [{ _id: false, id: String, title: String }],
    },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

attemptSchema.index({ user: 1, activity: 1, status: 1 });

export const AttemptModel = mongoose.model("Attempt", attemptSchema);
