import mongoose from "mongoose";

/**
 * Verbete do dicionário (coleção "signs").
 * - slug: identificador estável e busca sem acento ("maca" para "Maçã").
 * - vlibrasGloss: glosa tocada pelo avatar VLibras (LGPL-3.0); glossReviewed: conferida por pessoa fluente.
 * - source: origem e licença do conteúdo (exibir crédito).
 * - active: false = desativado no painel (some do dicionário; perguntas que já usam o sinal continuam funcionando).
 * Usado por: dicionário, perguntas "sign_choice" (ActivityModel.questions.sign) e assistente.
 */
const signSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    word: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, default: "", maxlength: 1000 },
    vlibrasGloss: { type: String, default: null, trim: true, maxlength: 120 },
    glossReviewed: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    source: {
      name: { type: String, required: true },
      license: { type: String, required: true },
      attribution: { type: String, required: true },
      url: { type: String, default: null },
    },
  },
  { timestamps: true },
);

signSchema.index({ category: 1, word: 1 });

export const SignModel = mongoose.model("Sign", signSchema);
