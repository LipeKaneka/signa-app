import * as GamificationAdmin from "../../services/service-admin-gamification.js";
import { listLevels as readLevels } from "../../services/service-level.js";
import { readActor } from "../../middlewares/admin-auth-middleware.js";
import { readRequiredString, readOptionalString, readBoolean, readInteger, readDate } from "../../utils/util-validators.js";
import { badRequest } from "../../utils/util-http-error.js";
import { readEventAppearance } from "../../config/event-appearance.js";
import { readEventSchedule } from "../../config/event-schedule.js";

/**
 * Campos de conquista. A chave só é lida ao criar (minúsculas, números e _).
 * @param {object} body
 * @param {boolean} creating
 * @returns {object}
 */
function readAchievementFields(body, creating) {
  const optional = (value, label, max) => readOptionalString(value, label, max) || undefined;
  const fields = {
    title: creating ? readRequiredString(body?.title, "o título", 80) : optional(body?.title, "Título", 80),
    description: creating ? readRequiredString(body?.description, "a descrição", 200) : optional(body?.description, "Descrição", 200),
    metric: creating ? readRequiredString(body?.metric, "a métrica", 40) : optional(body?.metric, "Métrica", 40),
    goal: body?.goal === undefined && !creating ? undefined : readInteger(body?.goal, "Meta", { min: 1, max: 10_000_000 }),
    icon: optional(body?.icon, "Ícone", 40) ?? (creating ? "medal" : undefined),
    order: body?.order === undefined ? (creating ? 0 : undefined) : readInteger(body.order, "Ordem", { min: 0, max: 10000 }),
    // Secreta: no app, enquanto bloqueada, não mostra título, descrição nem progresso.
    secret: readBoolean(body?.secret, "Secreta") ?? (creating ? false : undefined),
  };
  if (creating) {
    const key = readRequiredString(body?.key, "a chave", 60);
    if (!/^[a-z0-9_]+$/.test(key)) throw badRequest("Chave: use só letras minúsculas, números e _.");
    fields.key = key;
  } else {
    fields.active = readBoolean(body?.active, "Ativa");
  }
  return fields;
}

/** GET /admin/api/v1/achievements — {achievements, metrics}. */
export async function listAchievements(_req, res) {
  res.json(await GamificationAdmin.listAchievements());
}

/** POST /admin/api/v1/achievements → 201 {achievement}. */
export async function createAchievement(req, res) {
  res.status(201).json({ achievement: await GamificationAdmin.createAchievement(readActor(req), readAchievementFields(req.body, true)) });
}

/** PATCH /admin/api/v1/achievements/:id → {achievement}. */
export async function updateAchievement(req, res) {
  res.json({ achievement: await GamificationAdmin.updateAchievement(readActor(req), req.params.id, readAchievementFields(req.body, false)) });
}

/** DELETE /admin/api/v1/achievements/:id — exclusão definitiva (só desativada). */
export async function deleteAchievement(req, res) {
  await GamificationAdmin.deleteAchievement(readActor(req), req.params.id);
  res.json({ ok: true });
}

/**
 * Campos de evento (multiplicador a partir de 1, sem teto, aceita decimais como 1.5; aparência da faixa no app).
 * @param {object} body
 * @param {boolean} creating
 * @returns {object}
 */
function readEventFields(body, creating) {
  const multiplier = body?.multiplier;
  if ((creating || multiplier !== undefined) && (typeof multiplier !== "number" || !Number.isFinite(multiplier) || multiplier < 1)) {
    throw badRequest("Multiplicador: um número a partir de 1 (ex.: 2, 1.5 ou 50).");
  }
  let appearance;
  if (creating || body?.appearance !== undefined) {
    try {
      // Ao editar, os campos que não vierem são completados no serviço com a aparência atual.
      appearance = creating ? readEventAppearance(body?.appearance) : body.appearance;
      if (!creating) readEventAppearance(body.appearance);
    } catch (error) {
      throw badRequest(error.message);
    }
  }
  let schedule;
  if (creating || body?.schedule !== undefined) {
    try {
      schedule = readEventSchedule(body?.schedule);
    } catch (error) {
      throw badRequest(error.message);
    }
  }
  // Uma vez: início e fim obrigatórios. Recorrente: opcionais (null = sem limite), só limitam quando vale.
  const recurring = schedule && schedule.kind !== "once";
  const readLimit = (value, label) => {
    if (value === undefined) return creating && !recurring ? readDate(value, label) : undefined;
    if (value === null || value === "") {
      if (!recurring) throw badRequest(`${label}: obrigatório em evento de uma vez.`);
      return null;
    }
    return readDate(value, label);
  };
  const fields = {
    title: creating ? readRequiredString(body?.title, "o título", 80) : readOptionalString(body?.title, "Título", 80) || undefined,
    description: readOptionalString(body?.description, "Descrição", 200) ?? (creating ? "" : undefined),
    multiplier,
    startsAt: readLimit(body?.startsAt, "Início"),
    endsAt: readLimit(body?.endsAt, "Fim"),
    schedule,
    appearance,
  };
  if (creating) fields.type = "xp_multiplier";
  else fields.active = readBoolean(body?.active, "Ativo");
  return fields;
}

/** GET /admin/api/v1/events — {events} com state (scheduled/running/ended/inactive). */
export async function listEvents(_req, res) {
  res.json({ events: await GamificationAdmin.listEvents() });
}

/** POST /admin/api/v1/events → 201 {event}. */
export async function createEvent(req, res) {
  res.status(201).json({ event: await GamificationAdmin.createEvent(readActor(req), readEventFields(req.body, true)) });
}

/** PATCH /admin/api/v1/events/:id → {event}. */
export async function updateEvent(req, res) {
  res.json({ event: await GamificationAdmin.updateEvent(readActor(req), req.params.id, readEventFields(req.body, false)) });
}

/** POST /admin/api/v1/events/:id/end — encerra agora → {event}. */
export async function endEvent(req, res) {
  res.json({ event: await GamificationAdmin.endEventNow(readActor(req), req.params.id) });
}

/** DELETE /admin/api/v1/events/:id — exclusão definitiva (desativado ou encerrado). */
export async function deleteEvent(req, res) {
  await GamificationAdmin.deleteEvent(readActor(req), req.params.id);
  res.json({ ok: true });
}

/** GET /admin/api/v1/levels — {levels}. */
export async function listLevels(_req, res) {
  res.json({ levels: await readLevels() });
}

/** PUT /admin/api/v1/levels — {levels: [{minXp, title}]} (tabela inteira, em qualquer ordem: é ordenada por XP) → {levels}. */
export async function replaceLevels(req, res) {
  res.json({ levels: await GamificationAdmin.replaceLevels(readActor(req), GamificationAdmin.readLevelTable(req.body?.levels)) });
}

/** GET /admin/api/v1/settings — {settings} com definição e valor atual. */
export async function listSettings(_req, res) {
  res.json({ settings: await GamificationAdmin.listSettings() });
}

/** PUT /admin/api/v1/settings/:key — {value} → {key, value}. */
export async function updateSetting(req, res) {
  const value = await GamificationAdmin.updateSetting(readActor(req), req.params.key, req.body?.value);
  res.json({ key: req.params.key, value });
}

/** DELETE /admin/api/v1/settings/:key — volta ao padrão do código. */
export async function resetSetting(req, res) {
  await GamificationAdmin.resetSetting(readActor(req), req.params.key);
  res.json({ ok: true });
}
