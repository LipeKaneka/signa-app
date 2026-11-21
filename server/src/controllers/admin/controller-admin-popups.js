import * as PopupsService from "../../services/service-popups.js";
import { readActor } from "../../middlewares/admin-auth-middleware.js";
import { readBoolean, readDate, readOptionalString, readRequiredString } from "../../utils/util-validators.js";
import { badRequest } from "../../utils/util-http-error.js";
import { MESSAGES } from "../../config/messages.js";

/** Até quantos e-mails a lista de liberados da manutenção aceita. */
const MAX_ALLOWED_EMAILS = 200;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Texto opcional (undefined = não mudar; "" = vazio). */
const readText = (value, label, max) => (value === undefined ? undefined : readOptionalString(value, label, max));

/** Data opcional: undefined = não mudar; null/"" = sem data. */
function readOptionalDate(value, label) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return readDate(value, label);
}

/** Link opcional, só https. */
function readLink(value) {
  const link = readText(value, "Link", 500);
  if (link && !/^https:\/\//i.test(link)) throw badRequest(MESSAGES.popups.linkMustBeHttps);
  return link;
}

/** Tira os campos não enviados (undefined = não mudar). */
const definedOnly = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));

/** O fim, se houver, precisa ser depois do início. */
function checkPeriod(startsAt, endsAt) {
  if (startsAt && endsAt && endsAt <= startsAt) throw badRequest(MESSAGES.popups.endBeforeStart);
}

/** Campos de um aviso. partial = edição (só o que veio). */
function readAnnouncement(body = {}, { partial = false } = {}) {
  const data = definedOnly({
    title: partial && body.title === undefined ? undefined : readRequiredString(body.title, "o título", 80),
    message: readText(body.message, "Texto", 600),
    notesTitle: readText(body.notesTitle, "Título do quadro", 40),
    notes: readText(body.notes, "Quadro", 1000),
    buttonText: readText(body.buttonText, "Texto do botão", 40),
    link: readLink(body.link),
    active: readBoolean(body.active, "Ativo"),
    startsAt: readOptionalDate(body.startsAt, "Início"),
    endsAt: readOptionalDate(body.endsAt, "Fim"),
  });
  checkPeriod(data.startsAt, data.endsAt);
  return data;
}

/** E-mail de início/fim da manutenção: {enabled, subject, body}. */
function readEmailTemplate(value, label) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") throw badRequest(MESSAGES.validation.invalid(label));
  return {
    enabled: readBoolean(value.enabled, `${label}: enviar`) ?? false,
    subject: readOptionalString(value.subject ?? "", `${label}: assunto`, 120),
    body: readOptionalString(value.body ?? "", `${label}: texto`, 2000),
  };
}

/** Lista de e-mails liberados: aceita lista ou texto (um por linha, ou separados por vírgula). */
function readAllowedEmails(value) {
  if (value === undefined) return undefined;
  const list = (Array.isArray(value) ? value : String(value).split(/[\n,;]+/)).map((email) => String(email).trim().toLowerCase()).filter(Boolean);
  const unique = [...new Set(list)];
  if (unique.length > MAX_ALLOWED_EMAILS) throw badRequest(MESSAGES.popups.tooManyAllowedEmails(MAX_ALLOWED_EMAILS));
  const invalid = unique.find((email) => !EMAIL_PATTERN.test(email) || email.length > 254);
  if (invalid) throw badRequest(MESSAGES.popups.invalidAllowedEmail(invalid));
  return unique;
}

/** GET /admin/api/v1/popups/announcements — {announcements}. */
export async function listAnnouncements(_req, res) {
  res.json({ announcements: await PopupsService.listAnnouncements() });
}

/** POST /admin/api/v1/popups/announcements — 201 {announcement}. */
export async function createAnnouncement(req, res) {
  res.status(201).json({ announcement: await PopupsService.createAnnouncement(readActor(req), readAnnouncement(req.body)) });
}

/** PATCH /admin/api/v1/popups/announcements/:id — {announcement}. */
export async function updateAnnouncement(req, res) {
  res.json({ announcement: await PopupsService.updateAnnouncement(readActor(req), req.params.id, readAnnouncement(req.body, { partial: true })) });
}

/** DELETE /admin/api/v1/popups/announcements/:id — {deleted: true}. */
export async function deleteAnnouncement(req, res) {
  await PopupsService.deleteAnnouncement(readActor(req), req.params.id);
  res.json({ deleted: true });
}

/** GET /admin/api/v1/popups/maintenance — {maintenance}. */
export async function getMaintenance(_req, res) {
  res.json({ maintenance: await PopupsService.getMaintenanceForAdmin() });
}

/** PUT /admin/api/v1/popups/maintenance — campos da manutenção (os não enviados ficam como estão) → {maintenance}. */
export async function updateMaintenance(req, res) {
  const body = req.body ?? {};
  if (body.endEmailAudience !== undefined && !["blocked", "all"].includes(body.endEmailAudience)) {
    throw badRequest(MESSAGES.popups.invalidAudience);
  }
  const changes = definedOnly({
    enabled: readBoolean(body.enabled, "Ligada"),
    startsAt: readOptionalDate(body.startsAt, "Início"),
    endsAt: readOptionalDate(body.endsAt, "Fim"),
    title: readText(body.title, "Título", 80),
    message: readText(body.message, "Texto", 600),
    notesTitle: readText(body.notesTitle, "Título do quadro", 40),
    notes: readText(body.notes, "Quadro", 1000),
    buttonText: readText(body.buttonText, "Texto do botão", 40),
    allowedEmails: readAllowedEmails(body.allowedEmails),
    startEmail: readEmailTemplate(body.startEmail, "E-mail de início"),
    endEmail: readEmailTemplate(body.endEmail, "E-mail de fim"),
    endEmailAudience: body.endEmailAudience,
  });
  checkPeriod(changes.startsAt, changes.endsAt);
  res.json({ maintenance: await PopupsService.updateMaintenance(readActor(req), changes) });
}
