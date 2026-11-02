import mongoose from "mongoose";

/**
 * Atividade aprovada pelo usuário e a melhor nota (0-100). A presença aqui = atividade concluída.
 */
const completedActivitySchema = new mongoose.Schema(
  {
    activity: { type: mongoose.Schema.Types.ObjectId, ref: "Activity", required: true },
    bestScore: { type: Number, required: true, min: 0, max: 100 },
    completedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

/**
 * Posição no ranking da última consulta e a melhor já alcançada, por critério (activities | xp | streak).
 * Alimenta as pílulas "▲ N Posições" e "Melhor: Nº X" e pode alimentar conquistas de ranking.
 */
const rankingPositionSchema = new mongoose.Schema(
  {
    last: { type: Number, default: null },
    best: { type: Number, default: null },
  },
  { _id: false },
);

/**
 * Usuário (coleção "users").
 * - publicId: id que aparece na API (o _id nunca sai). passwordHash: bcrypt, nunca selecionado por padrão.
 * - status: "active" | "blocked" (bloqueado não entra; base para moderação pelo painel).
 * - xp, streak/maxStreak/lastActivityDay ("AAAA-MM-DD" em Brasília), totalCorrectAnswers: métricas de progresso
 *   e de conquistas (veja readAchievementMetrics).
 * - completedActivities + completedActivitiesCount: progresso na trilha (o contador existe para ordenar o ranking).
 * - showInRanking: privacidade do ranking. rankingPositions: histórico de posição.
 * - termsAcceptedAt: quando a pessoa aceitou o Termo de Uso no cadastro (null = conta anterior ao termo).
 * - passwordReset: código de recuperação de senha em andamento (só o hash; nunca selecionado por padrão).
 * Usado por: auth, perfil, trilha, tentativas, ranking.
 */
const userSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true, unique: true },
    nickname: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    status: { type: String, enum: ["active", "blocked"], default: "active" },
    city: { type: String, default: "", trim: true, maxlength: 60 },
    // Foto de perfil como data URL (JPEG/PNG/WebP, 256×256, validada em readAvatar); "" = sem foto.
    avatar: { type: String, default: "", maxlength: 60000 },
    // Miniatura 64×64 da foto, mostrada no ranking (leve para listas longas).
    avatarThumb: { type: String, default: "", maxlength: 8000 },
    showInRanking: { type: Boolean, default: true },
    xp: { type: Number, default: 0, min: 0 },
    streak: { type: Number, default: 0, min: 0 },
    maxStreak: { type: Number, default: 0, min: 0 },
    lastActivityDay: { type: String, default: null },
    totalCorrectAnswers: { type: Number, default: 0, min: 0 },
    completedActivities: { type: [completedActivitySchema], default: [] },
    completedActivitiesCount: { type: Number, default: 0, min: 0 },
    lastLogin: { type: Date, default: null },
    termsAcceptedAt: { type: Date, default: null },
    passwordReset: {
      type: {
        _id: false,
        codeHash: String,
        expiresAt: Date,
        attempts: { type: Number, default: 0 },
        sentAt: Date,
      },
      default: null,
      select: false,
    },
    // Quando cada conquista foi desbloqueada (key = AchievementModel.key). O desbloqueio continua sendo calculado
    // pelas métricas; aqui só fica a data, para a tela "Conquistas" e as conquistas recentes do perfil.
    achievementUnlocks: {
      type: [{ _id: false, key: { type: String, required: true }, unlockedAt: { type: Date, required: true } }],
      default: [],
    },
    rankingPositions: {
      activities: { type: rankingPositionSchema, default: () => ({}) },
      xp: { type: rankingPositionSchema, default: () => ({}) },
      streak: { type: rankingPositionSchema, default: () => ({}) },
    },
  },
  { timestamps: true },
);

userSchema.index({ completedActivitiesCount: -1, _id: 1 });
userSchema.index({ xp: -1, _id: 1 });
userSchema.index({ streak: -1, _id: 1 });

export const UserModel = mongoose.model("User", userSchema);
