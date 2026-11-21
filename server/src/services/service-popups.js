import { AnnouncementModel } from "../models/model-announcement.js";
import { MaintenanceModel } from "../models/model-maintenance.js";
import { UserModel } from "../models/model-user.js";
import { MESSAGES } from "../config/messages.js";
import { HttpError, notFound } from "../utils/util-http-error.js";
import { createTimedCache } from "../utils/util-timed-cache.js";
import { recordAudit } from "./service-audit.js";
import { bumpContentVersion } from "./service-content-version.js";
import { sendEmail } from "./service-mailer.js";

/**
 * Pop-ups do app em três categorias, todas editadas no painel (Pop-ups):
 * - Avisos: AnnouncementModel, vários, cada um aparece uma vez por aparelho.
 * - Manutenção: MaintenanceModel (documento único). Valendo, só as contas liberadas (allowedEmails) usam o app; as
 *   outras recebem 503 {code: "maintenance"} em toda rota de usuário e no login, e o app mostra o pop-up e fecha.
 *   Ao começar e ao terminar, manda os e-mails configurados.
 * - Atualizações: continuam nas configurações app.update.* (versões, link e textos do pop-up).
 * O app recebe os avisos ativos e o estado da manutenção em GET /internal/v1/app-config (campo popups).
 */

const DEFAULTS = MESSAGES.popups.defaults;
/** Curto: ligar/desligar no painel limpa o cache na hora; o tempo só cobre o início/fim agendado. */
const CACHE_MS = 5 * 1000;
const cache = createTimedCache(CACHE_MS);
/** Quantos e-mails são enviados ao mesmo tempo (o provedor recusa rajadas grandes). */
const EMAIL_CONCURRENCY = 5;
const FORECAST_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
});

/** Esquece os pop-ups em cache (depois de mudar no painel). */
export function clearPopupsCache() {
  cache.clear();
}

/* ------------------------------------------------------------------------------------------------ manutenção */

/** Documento da manutenção (cria o padrão na primeira vez). */
async function loadMaintenanceDocument() {
  return (await MaintenanceModel.findOne({ key: "main" })) ?? MaintenanceModel.create({ key: "main" });
}

/** A manutenção está valendo agora? (ligada e dentro do período, quando houver datas). */
export function isMaintenanceActive(maintenance, now = new Date()) {
  if (!maintenance?.enabled) return false;
  if (maintenance.startsAt && new Date(maintenance.startsAt) > now) return false;
  if (maintenance.endsAt && new Date(maintenance.endsAt) <= now) return false;
  return true;
}

/** "21/11 às 18:00" (horário de Brasília) ou o texto de "sem previsão". */
function describeForecast(endsAt) {
  return endsAt ? FORECAST_FORMAT.format(new Date(endsAt)).replace(", ", " às ") : DEFAULTS.noForecast;
}

/**
 * Pop-up de manutenção como o app usa (com os textos padrão onde o painel deixou vazio).
 * Sem "Novidades" escritas e com previsão de fim, o quadro mostra a previsão.
 */
function toPublicMaintenance(maintenance, now = new Date()) {
  const active = isMaintenanceActive(maintenance, now);
  const notes = maintenance?.notes || (maintenance?.endsAt ? `Volta prevista: ${describeForecast(maintenance.endsAt)}.` : "");
  return {
    active,
    title: maintenance?.title || DEFAULTS.maintenanceTitle,
    message: maintenance?.message || DEFAULTS.maintenanceMessage,
    notesTitle: notes ? maintenance?.notesTitle || DEFAULTS.maintenanceNotesTitle : "",
    notes,
    buttonText: maintenance?.buttonText || DEFAULTS.maintenanceButton,
    endsAt: maintenance?.endsAt ?? null,
  };
}

/** Estado da manutenção em cache: {active, allowed: Set de e-mails, popup}. */
function readMaintenanceState() {
  return cache.get("maintenance", async () => {
    const maintenance = await MaintenanceModel.findOne({ key: "main" }).lean();
    return {
      maintenance,
      allowed: new Set((maintenance?.allowedEmails ?? []).map((email) => email.toLowerCase())),
    };
  });
}

/**
 * Barra quem não está liberado enquanto a manutenção vale: 503 {code: "maintenance", maintenance} (o backend repassa
 * ao app, que mostra o pop-up e fecha). Guarda a conta barrada para o e-mail de fim ("só quem foi barrado").
 * @param {{_id?: unknown, email: string}} user
 * @returns {Promise<void>}
 * @throws {HttpError} 503.
 * Usado por: loadUser, conferência de sessão, login, cadastro, Google e recuperação de senha.
 */
export async function assertAppAccess(user) {
  const { maintenance, allowed } = await readMaintenanceState();
  if (!isMaintenanceActive(maintenance)) return;
  if (user?.email && allowed.has(String(user.email).toLowerCase())) return;
  if (user?._id) MaintenanceModel.updateOne({ key: "main" }, { $addToSet: { blockedUsers: user._id } }).catch(() => {});
  const popup = toPublicMaintenance(maintenance);
  throw new HttpError(503, popup.message, { code: "maintenance", maintenance: popup });
}

/** Troca {nome} e {previsao} no texto do e-mail. */
function fillEmail(text, user, maintenance) {
  return String(text).replaceAll("{nome}", user.nickname || "").replaceAll("{previsao}", describeForecast(maintenance.endsAt));
}

/** Manda o e-mail para cada pessoa (alguns ao mesmo tempo). Falhas vão para o log e não param os outros. */
async function sendMaintenanceEmails(users, { subject, body }, maintenance, category) {
  let sent = 0;
  for (let start = 0; start < users.length; start += EMAIL_CONCURRENCY) {
    const results = await Promise.allSettled(users.slice(start, start + EMAIL_CONCURRENCY).map((user) =>
      sendEmail({ to: user.email, subject: fillEmail(subject, user, maintenance), text: fillEmail(body, user, maintenance), category })));
    sent += results.filter((result) => result.status === "fulfilled" && result.value).length;
    results.filter((result) => result.status === "rejected").forEach((result) => console.error("E-mail de manutenção falhou:", result.reason?.message));
  }
  return sent;
}

/**
 * Confere se a manutenção começou ou terminou desde a última vez e faz o que cada passagem pede: marca o início,
 * manda os e-mails e sobe a versão do conteúdo (o backend renova o /app-config em segundos). Cada passagem é atômica
 * no banco: o agendador e o painel ao mesmo tempo não mandam o e-mail duas vezes.
 * @param {Date} [now]
 * @returns {Promise<"started"|"ended"|null>}
 * Usado por: service-notification-scheduler.js (a cada minuto) e updateMaintenance (na hora em que o painel salva).
 */
export async function syncMaintenance(now = new Date()) {
  const maintenance = await MaintenanceModel.findOne({ key: "main" }).lean();
  if (!maintenance) return null;
  const active = isMaintenanceActive(maintenance, now);

  if (active && !maintenance.startedAt) {
    const { modifiedCount } = await MaintenanceModel.updateOne({ key: "main", startedAt: null }, { $set: { startedAt: now, blockedUsers: [] } });
    if (modifiedCount !== 1) return null;
    clearPopupsCache();
    await bumpContentVersion();
    if (maintenance.startEmail?.enabled) {
      const users = await UserModel.find({ status: "active" }).select("email nickname").lean();
      const template = { subject: maintenance.startEmail.subject || DEFAULTS.startEmailSubject, body: maintenance.startEmail.body || DEFAULTS.startEmailBody };
      sendMaintenanceEmails(users, template, maintenance, "maintenance-start").catch(() => {});
    }
    return "started";
  }

  if (!active && maintenance.startedAt) {
    const before = await MaintenanceModel.findOneAndUpdate(
      { key: "main", startedAt: { $ne: null } },
      { $set: { startedAt: null, blockedUsers: [] } },
      { returnDocument: "before" },
    ).lean();
    if (!before) return null;
    clearPopupsCache();
    await bumpContentVersion();
    if (before.endEmail?.enabled) {
      const filter = before.endEmailAudience === "all" ? { status: "active" } : { _id: { $in: before.blockedUsers ?? [] }, status: "active" };
      const users = await UserModel.find(filter).select("email nickname").lean();
      const template = { subject: before.endEmail.subject || DEFAULTS.endEmailSubject, body: before.endEmail.body || DEFAULTS.endEmailBody };
      sendMaintenanceEmails(users, template, before, "maintenance-end").catch(() => {});
    }
    return "ended";
  }
  return null;
}

/** Manutenção como o painel vê (tudo, com o estado calculado e os padrões para mostrar nos campos vazios). */
function toAdminMaintenance(maintenance) {
  return {
    enabled: maintenance.enabled,
    startsAt: maintenance.startsAt,
    endsAt: maintenance.endsAt,
    title: maintenance.title,
    message: maintenance.message,
    notesTitle: maintenance.notesTitle,
    notes: maintenance.notes,
    buttonText: maintenance.buttonText,
    allowedEmails: maintenance.allowedEmails,
    startEmail: { enabled: maintenance.startEmail?.enabled ?? false, subject: maintenance.startEmail?.subject ?? "", body: maintenance.startEmail?.body ?? "" },
    endEmail: { enabled: maintenance.endEmail?.enabled ?? false, subject: maintenance.endEmail?.subject ?? "", body: maintenance.endEmail?.body ?? "" },
    endEmailAudience: maintenance.endEmailAudience,
    active: isMaintenanceActive(maintenance),
    startedAt: maintenance.startedAt,
    blockedCount: maintenance.blockedUsers?.length ?? 0,
    updatedAt: maintenance.updatedAt,
    updatedBy: maintenance.updatedBy,
    defaults: DEFAULTS,
  };
}

/** @returns {Promise<object>} Usado por: GET /admin/api/v1/popups/maintenance. */
export async function getMaintenanceForAdmin() {
  return toAdminMaintenance(await loadMaintenanceDocument());
}

/**
 * Salva a manutenção (campos já validados no controller) e já aplica o começo/fim, se mudou.
 * @param {object} actor
 * @param {object} changes
 * @returns {Promise<object>} manutenção como o painel vê.
 * Usado por: PUT /admin/api/v1/popups/maintenance.
 */
export async function updateMaintenance(actor, changes) {
  const maintenance = await loadMaintenanceDocument();
  const before = toAdminMaintenance(maintenance);
  Object.assign(maintenance, changes, { updatedBy: actor.admin?.email ?? null });
  await maintenance.save();
  clearPopupsCache();
  await bumpContentVersion();
  await syncMaintenance();
  const after = await getMaintenanceForAdmin();
  await recordAudit(actor, {
    action: "update",
    entity: "maintenance",
    entityId: "main",
    summary: after.active ? "manutenção ligada" : before.active ? "manutenção desligada" : "manutenção alterada",
    before: { enabled: before.enabled, startsAt: before.startsAt, endsAt: before.endsAt, allowedEmails: before.allowedEmails },
    after: { enabled: after.enabled, startsAt: after.startsAt, endsAt: after.endsAt, allowedEmails: after.allowedEmails },
  });
  return after;
}

/* ---------------------------------------------------------------------------------------------------- avisos */

/** O aviso vale agora? (ativo e dentro do período). */
function isAnnouncementLive(announcement, now = new Date()) {
  if (!announcement.active) return false;
  if (announcement.startsAt && new Date(announcement.startsAt) > now) return false;
  if (announcement.endsAt && new Date(announcement.endsAt) <= now) return false;
  return true;
}

/** Aviso como o app usa. version muda a cada edição (o app mostra de novo um aviso editado). */
function toPublicAnnouncement(announcement) {
  return {
    id: String(announcement._id),
    version: new Date(announcement.updatedAt).toISOString(),
    title: announcement.title,
    message: announcement.message,
    notesTitle: announcement.notes ? announcement.notesTitle : "",
    notes: announcement.notes,
    buttonText: announcement.buttonText || DEFAULTS.announcementButton,
    link: announcement.link,
  };
}

function toAdminAnnouncement(announcement) {
  return { ...toPublicAnnouncement(announcement), buttonText: announcement.buttonText, notesTitle: announcement.notesTitle,
    active: announcement.active, startsAt: announcement.startsAt, endsAt: announcement.endsAt, live: isAnnouncementLive(announcement),
    createdAt: announcement.createdAt, updatedAt: announcement.updatedAt, updatedBy: announcement.updatedBy };
}

/** @returns {Promise<object[]>} todos os avisos, do mais novo para o mais antigo. Usado por: painel. */
export async function listAnnouncements() {
  return (await AnnouncementModel.find().sort({ createdAt: -1 }).lean()).map(toAdminAnnouncement);
}

/** Usado por: POST /admin/api/v1/popups/announcements. */
export async function createAnnouncement(actor, data) {
  const announcement = await AnnouncementModel.create({ ...data, updatedBy: actor.admin?.email ?? null });
  clearPopupsCache();
  await bumpContentVersion();
  await recordAudit(actor, { action: "create", entity: "announcement", entityId: announcement._id, summary: `aviso "${announcement.title}" criado`, after: announcement });
  return toAdminAnnouncement(announcement.toObject());
}

/** Usado por: PATCH /admin/api/v1/popups/announcements/:id. */
export async function updateAnnouncement(actor, id, changes) {
  const announcement = await AnnouncementModel.findById(id);
  if (!announcement) throw notFound(MESSAGES.popups.announcementNotFound);
  const before = announcement.toObject();
  Object.assign(announcement, changes, { updatedBy: actor.admin?.email ?? null });
  await announcement.save();
  clearPopupsCache();
  await bumpContentVersion();
  await recordAudit(actor, { action: "update", entity: "announcement", entityId: id, summary: `aviso "${announcement.title}" alterado`, before, after: announcement });
  return toAdminAnnouncement(announcement.toObject());
}

/** Usado por: DELETE /admin/api/v1/popups/announcements/:id. */
export async function deleteAnnouncement(actor, id) {
  const announcement = await AnnouncementModel.findByIdAndDelete(id).lean();
  if (!announcement) throw notFound(MESSAGES.popups.announcementNotFound);
  clearPopupsCache();
  await bumpContentVersion();
  await recordAudit(actor, { action: "delete", entity: "announcement", entityId: id, summary: `aviso "${announcement.title}" excluído`, before: announcement });
}

/* ----------------------------------------------------------------------------------------------------- app */

/**
 * Pop-ups para o app: avisos valendo agora e o estado da manutenção (sem a lista de liberados).
 * @returns {Promise<{announcements: object[], maintenance: object}>}
 * Usado por: GET /internal/v1/app-config.
 */
export async function getPublicPopups(now = new Date()) {
  const [announcements, { maintenance }] = await Promise.all([
    cache.get("announcements", () => AnnouncementModel.find({ active: true }).sort({ createdAt: 1 }).lean()),
    readMaintenanceState(),
  ]);
  return {
    announcements: announcements.filter((announcement) => isAnnouncementLive(announcement, now)).map(toPublicAnnouncement),
    maintenance: toPublicMaintenance(maintenance, now),
  };
}
