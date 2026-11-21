import { getSetting } from "./service-settings.js";
import { readLatestRelease } from "./service-github-release.js";
import { updateSetting } from "./service-admin-gamification.js";

/** De quanto em quanto tempo o servidor confere se saiu release nova (a API do GitHub aceita 60 consultas/hora). */
export const APP_UPDATE_SYNC_INTERVAL_MS = 10 * 60 * 1000;
/** "Quem" aparece na auditoria quando a atualização é aplicada sozinha. */
const SYSTEM_ACTOR = Object.freeze({ admin: { _id: null, email: "automático (GitHub)" }, ip: null });

/**
 * Atualização automática do APK: confere a release mais recente do GitHub (app.update.githubRepo) e, se o
 * versionCode dela for maior que o configurado, aplica sozinho os mesmos campos do botão "Buscar no GitHub"
 * (nome, link do APK, novidades e por último o número, que avisa todo mundo). Quem tem versão menor passa a ver o
 * pop-up de atualização. Desligado com app.update.autoFromGithub = 0 (Pop-ups → Atualizações).
 * Nunca lança: GitHub fora do ar ou release incompleta só vão para o log e tenta de novo na próxima vez.
 * @returns {Promise<number|null>} versionCode aplicado, ou null se não mudou nada.
 * Usado por: service-notification-scheduler.js (a cada APP_UPDATE_SYNC_INTERVAL_MS).
 */
export async function syncAppUpdateFromGithub() {
  try {
    if (Number(await getSetting("app.update.autoFromGithub")) !== 1) return null;
    const repo = String(await getSetting("app.update.githubRepo") ?? "").trim();
    if (!repo) return null;
    const { fields, tag } = await readLatestRelease(repo);
    const current = Number(await getSetting("app.update.latestVersionCode")) || 0;
    // Só aplica release completa (com número e APK) e mais nova que a configurada.
    if (!fields.latestVersionCode || !fields.downloadUrl || fields.latestVersionCode <= current) return null;

    if (fields.versionName) await updateSetting(SYSTEM_ACTOR, "app.update.versionName", fields.versionName.slice(0, 30));
    await updateSetting(SYSTEM_ACTOR, "app.update.downloadUrl", fields.downloadUrl);
    await updateSetting(SYSTEM_ACTOR, "app.update.notes", String(fields.notes ?? "").slice(0, 600));
    await updateSetting(SYSTEM_ACTOR, "app.update.latestVersionCode", fields.latestVersionCode);
    console.log(`Atualização do app aplicada automaticamente: ${tag} (versionCode ${fields.latestVersionCode}).`);
    return fields.latestVersionCode;
  } catch (error) {
    console.error("Atualização automática pelo GitHub falhou:", error.message);
    return null;
  }
}
