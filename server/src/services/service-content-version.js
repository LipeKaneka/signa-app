import { SettingModel } from "../models/model-setting.js";

const CONTENT_VERSION_KEY = "content.version";

/**
 * Versão atual do conteúdo (número que só cresce). O backend guarda em cache o conteúdo público
 * (dicionário, eventos, configurações do app) e descarta o cache quando esta versão muda.
 * @returns {Promise<number>}
 * Usado por: GET /internal/v1/content/version.
 */
export async function getContentVersion() {
  const setting = await SettingModel.findOne({ key: CONTENT_VERSION_KEY }).lean();
  return setting?.value ?? 0;
}

/**
 * Incrementa a versão do conteúdo (de forma atômica). Chame sempre que o conteúdo público mudar:
 * sinais, módulos, atividades, conquistas, eventos, níveis ou configurações.
 * @returns {Promise<number>} nova versão.
 * Usado por: seed e, na Etapa 5, por toda alteração feita pelo painel.
 */
export async function bumpContentVersion() {
  const setting = await SettingModel.findOneAndUpdate(
    { key: CONTENT_VERSION_KEY },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  return setting.value;
}
