import { findActiveEvents } from "../services/service-event.js";
import { getPublicSettings } from "../services/service-settings.js";
import { listLevels } from "../services/service-level.js";
import { getContentVersion } from "../services/service-content-version.js";

/** GET /internal/v1/content/version — {version}: o backend compara para saber se o cache ainda vale. */
export async function getVersion(_req, res) {
  res.json({ version: await getContentVersion() });
}

/** GET /internal/v1/events/active — {events} valendo agora (ex.: 2x XP). */
export async function listActiveEvents(_req, res) {
  res.json({ events: await findActiveEvents() });
}

/** GET /internal/v1/app-config — {settings, levels, contentVersion}: textos e regras públicas do app. */
export async function getAppConfig(_req, res) {
  const [settings, levels, contentVersion] = await Promise.all([
    getPublicSettings(),
    listLevels(),
    getContentVersion(),
  ]);
  res.json({ settings, levels, contentVersion });
}
