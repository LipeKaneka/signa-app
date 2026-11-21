import mongoose from "mongoose";

const emailSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    subject: { type: String, default: "", trim: true, maxlength: 120 },
    body: { type: String, default: "", trim: true, maxlength: 2000 },
  },
  { _id: false },
);

/**
 * Manutenção do app (categoria "Manutenção" do painel). Documento único (key "main").
 * - enabled + startsAt/endsAt: está valendo quando enabled e agora está dentro do período (datas opcionais:
 *   sem início = já começou; sem fim = até desligar no painel).
 * - Pop-up: title, message, notesTitle/notes (quadro roxo) e buttonText (botão que fecha o app).
 * - allowedEmails: contas que continuam usando o app durante a manutenção (equipe, testadores).
 * - startEmail: e-mail para todas as contas ativas quando a manutenção começa.
 * - endEmail: e-mail quando termina; endEmailAudience "blocked" = só quem tentou entrar e foi barrado; "all" = todos.
 * - Controle interno: startedAt (manutenção em andamento, já avisada), blockedUsers (barrados nesta manutenção).
 * Usado por: service-popups.js.
 */
const maintenanceSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "main" },
    enabled: { type: Boolean, default: false },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    title: { type: String, default: "", trim: true, maxlength: 80 },
    message: { type: String, default: "", trim: true, maxlength: 600 },
    notesTitle: { type: String, default: "", trim: true, maxlength: 40 },
    notes: { type: String, default: "", trim: true, maxlength: 1000 },
    buttonText: { type: String, default: "", trim: true, maxlength: 40 },
    allowedEmails: { type: [String], default: [] },
    startEmail: { type: emailSchema, default: () => ({}) },
    endEmail: { type: emailSchema, default: () => ({}) },
    endEmailAudience: { type: String, enum: ["blocked", "all"], default: "blocked" },
    startedAt: { type: Date, default: null },
    blockedUsers: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

export const MaintenanceModel = mongoose.model("Maintenance", maintenanceSchema);
