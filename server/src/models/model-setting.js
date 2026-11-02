import mongoose from "mongoose";

/**
 * Configuração chave/valor (coleção "settings"), editável pelo painel.
 * Chaves conhecidas e validação: config/setting-definitions.js. Valor ausente = padrão do código.
 * Também guarda "content.version" (versão do conteúdo, usada pelo cache do backend).
 * Usado por: service-settings.js, service-content-version.js.
 */
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, maxlength: 80 },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

export const SettingModel = mongoose.model("Setting", settingSchema);
