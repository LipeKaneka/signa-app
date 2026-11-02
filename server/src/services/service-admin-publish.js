import { bumpContentVersion } from "./service-content-version.js";
import { clearAchievementsCache } from "./service-achievement.js";
import { clearEventsCache } from "./service-event.js";
import { clearLevelsCache } from "./service-level.js";
import { clearSettingsCache } from "./service-settings.js";

/**
 * Chame depois de QUALQUER alteração de conteúdo público feita pelo painel: limpa os caches do servidor
 * (valem na hora aqui) e sobe a versão do conteúdo (o backend descarta o cache dele em até
 * CONTENT_VERSION_TTL_MS). Sem isso, o app poderia continuar vendo o conteúdo antigo.
 * @returns {Promise<number>} nova versão do conteúdo.
 * Usado por: services do painel (trilha, dicionário, conquistas, eventos, níveis, configurações, banco).
 */
export async function publishContentChange() {
  clearAchievementsCache();
  clearEventsCache();
  clearLevelsCache();
  clearSettingsCache();
  return bumpContentVersion();
}
