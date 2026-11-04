import mongoose from "mongoose";

/**
 * Tipos de pergunta aceitos. O app desenha "sign_choice" (escolher a palavra do sinal) e "camera_sign" (fazer o sinal
 * na frente da câmera); os outros já existem no modelo.
 */
export const QUESTION_TYPES = Object.freeze(["sign_choice", "single_choice", "true_false", "camera_sign"]);

/**
 * Pergunta de uma atividade. sign_choice = "Qual sinal é esse?": o avatar faz o sinal (Sign.vlibrasGloss)
 * e o aluno escolhe a palavra. correctOptionId (gabarito) nunca vai para o app antes da resposta
 * (veja toPublicQuestion em service-attempt.js).
 * camera_sign = "Faça o sinal": target é o rótulo que o reconhecedor do app devolve (config/camera-targets.js);
 * as alternativas são fixas ("done"/"skip") e sign é opcional (avatar para a pessoa ver o sinal antes).
 */
const questionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    type: { type: String, enum: QUESTION_TYPES, required: true },
    prompt: { type: String, required: true, maxlength: 500 },
    sign: { type: mongoose.Schema.Types.ObjectId, ref: "Sign", default: null },
    options: {
      type: [{ _id: false, id: { type: String, required: true }, text: { type: String, required: true, maxlength: 200 } }],
      validate: (options) => options.length >= 2,
    },
    correctOptionId: { type: String, required: true },
    explanation: { type: String, default: "", maxlength: 1000 },
    target: { type: String, default: null, maxlength: 40 },
  },
  { _id: false },
);

/**
 * Atividade (coleção "activities"): pertence a um módulo, tem ordem dentro dele, descrição curta (cartão da
 * unidade no app) e uma lista de perguntas.
 * (module, order) é único. active: false = desativada no painel (some da trilha).
 * questionsPerAttempt: se preenchido, cada tentativa sorteia essa quantidade de perguntas, em ordem aleatória
 * (ex.: "letras aleatórias": 10 de 13 letras); vazio = todas as perguntas, na ordem cadastrada. Usado por: service-trail.js, service-attempt.js, seeds.
 */
const activitySchema = new mongoose.Schema(
  {
    module: { type: mongoose.Schema.Types.ObjectId, ref: "Module", required: true },
    order: { type: Number, required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: "", trim: true, maxlength: 200 },
    questions: { type: [questionSchema], validate: (questions) => questions.length > 0 },
    questionsPerAttempt: { type: Number, default: null, min: 1, max: 30 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

activitySchema.index({ module: 1, order: 1 }, { unique: true });

export const ActivityModel = mongoose.model("Activity", activitySchema);
