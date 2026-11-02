import * as ContentService from "../services/service-content.js";

/**
 * GET /events/active — responde {events} valendo agora (ex.: 2x XP).
 */
export async function listActiveEvents(_req, res) {
  res.json({ events: await ContentService.listActiveEvents() });
}

/**
 * GET /app-config — responde {settings, levels, contentVersion} (textos e regras públicas do app).
 */
export async function getAppConfig(_req, res) {
  res.json(await ContentService.getAppConfig());
}
