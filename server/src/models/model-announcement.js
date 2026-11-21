import mongoose from "mongoose";

/**
 * Aviso em pop-up no app (categoria "Avisos" do painel). Aparece uma vez por aparelho (o app guarda que viu
 * id + updatedAt: editar o aviso faz ele aparecer de novo), só enquanto estiver ativo e dentro do período.
 * - notesTitle/notes: o quadro roxo do pop-up (ex.: "Novidades"); vazio = sem quadro.
 * - buttonText: texto do botão (padrão "Entendi"); link: se houver, o botão abre o link (https).
 * - startsAt/endsAt: período opcional (sem datas = vale enquanto estiver ativo).
 * Usado por: service-popups.js.
 */
const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 80 },
    message: { type: String, default: "", trim: true, maxlength: 600 },
    notesTitle: { type: String, default: "", trim: true, maxlength: 40 },
    notes: { type: String, default: "", trim: true, maxlength: 1000 },
    buttonText: { type: String, default: "", trim: true, maxlength: 40 },
    link: { type: String, default: "", trim: true, maxlength: 500 },
    active: { type: Boolean, default: true },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

announcementSchema.index({ active: 1, startsAt: 1, endsAt: 1 });

export const AnnouncementModel = mongoose.model("Announcement", announcementSchema);
