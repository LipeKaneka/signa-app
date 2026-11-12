import * as UsersAdmin from "../../services/service-admin-users.js";
import { APP_EVENT_METRICS } from "../../config/achievement-metrics.js";
import { readActor } from "../../middlewares/admin-auth-middleware.js";
import { badRequest } from "../../utils/util-http-error.js";
import { readRequiredString, readOptionalString, readPositiveInteger, readInteger, readEmail, readBoolean } from "../../utils/util-validators.js";

/** Motivo obrigatório das ações sobre usuários (fica na auditoria). */
const readReason = (body) => readRequiredString(body?.reason, "o motivo", 200);

/** GET /admin/api/v1/users?search=&status=&page=&limit= — {users, total, page, pages}. */
export async function list(req, res) {
  const status = ["active", "blocked"].includes(req.query.status) ? req.query.status : undefined;
  res.json(
    await UsersAdmin.listUsers({
      search: readOptionalString(req.query.search, "Busca", 80),
      status,
      page: readPositiveInteger(req.query.page, { fallback: 1, max: 10000 }),
      limit: readPositiveInteger(req.query.limit, { fallback: 30, max: 100 }),
    }),
  );
}

/** GET /admin/api/v1/users/:id — {user} com progresso, conquistas e últimas tentativas. */
export async function detail(req, res) {
  res.json({ user: await UsersAdmin.getUserDetail(req.params.id) });
}

/**
 * Prazo do banimento em dias: vazio/null/0 = sem prazo; senão inteiro de 1 a MAX_BAN_DAYS.
 * @param {unknown} value
 * @returns {number|null}
 */
function readBanDays(value) {
  if (value === undefined || value === null || value === "" || value === 0) return null;
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > UsersAdmin.MAX_BAN_DAYS) {
    throw badRequest(`Prazo do banimento: de 1 a ${UsersAdmin.MAX_BAN_DAYS} dias (ou sem prazo).`);
  }
  return days;
}

/** PATCH /admin/api/v1/users/:id/status — {status: "active"|"blocked", reason, durationDays?} → {user}. */
export async function setStatus(req, res) {
  const durationDays = req.body?.status === "blocked" ? readBanDays(req.body?.durationDays) : null;
  res.json({ user: await UsersAdmin.setUserStatus(readActor(req), req.params.id, req.body?.status, readReason(req.body), durationDays) });
}

/** Inteiro >= 0 sem teto prático (até Number.MAX_SAFE_INTEGER), ou undefined se não veio. */
function readCounter(value, label) {
  return value === undefined ? undefined : readInteger(value, label, { min: 0, max: UsersAdmin.MAX_COUNTER });
}

/** POST /admin/api/v1/users/:id/xp — {delta, reason} → {user}. Sem limite de quanto dar ou tirar. */
export async function adjustXp(req, res) {
  const delta = readInteger(req.body?.delta, "Ajuste de XP", { min: -UsersAdmin.MAX_COUNTER, max: UsersAdmin.MAX_COUNTER });
  if (delta === 0) throw badRequest("Ajuste de XP: use um número diferente de 0.");
  res.json({ user: await UsersAdmin.adjustUserXp(readActor(req), req.params.id, delta, readReason(req.body)) });
}

/** PATCH /admin/api/v1/users/:id/profile — {nickname?, email?, city?, showInRanking?, reason} → {user}. */
export async function updateProfile(req, res) {
  const body = req.body ?? {};
  const changes = {
    nickname: body.nickname === undefined ? undefined : readRequiredString(body.nickname, "o apelido", 60),
    email: body.email === undefined ? undefined : readEmail(body.email),
    city: body.city === undefined ? undefined : readOptionalString(body.city, "Cidade", 60),
    showInRanking: readBoolean(body.showInRanking, "Aparecer no ranking"),
  };
  res.json({ user: await UsersAdmin.updateUserProfile(readActor(req), req.params.id, changes, readReason(body)) });
}

/** PATCH /admin/api/v1/users/:id/stats — {xp?, streak?, maxStreak?, totalCorrectAnswers?, reason} (valores exatos) → {user}. */
export async function updateStats(req, res) {
  const body = req.body ?? {};
  const values = {
    xp: readCounter(body.xp, "XP"),
    streak: readCounter(body.streak, "Ofensiva"),
    maxStreak: readCounter(body.maxStreak, "Maior ofensiva"),
    totalCorrectAnswers: readCounter(body.totalCorrectAnswers, "Acertos"),
  };
  res.json({ user: await UsersAdmin.updateUserStats(readActor(req), req.params.id, values, readReason(body)) });
}

/**
 * PATCH /admin/api/v1/users/:id/counters — {actions?: {tap_xp: 10, ...}, dictionary?: "all"|"none", reason} → {user}.
 * Contadores das conquistas por ações no app (valores exatos, sem limite).
 */
export async function updateCounters(req, res) {
  const body = req.body ?? {};
  const actions = {};
  if (body.actions !== undefined) {
    if (!body.actions || typeof body.actions !== "object" || Array.isArray(body.actions)) throw badRequest("actions deve ser um objeto.");
    for (const [type, value] of Object.entries(body.actions)) {
      if (!APP_EVENT_METRICS[type]) throw badRequest(`Contador desconhecido: ${type}.`);
      actions[type] = readInteger(value, type, { min: 0, max: UsersAdmin.MAX_COUNTER });
    }
  }
  if (body.dictionary !== undefined && !["all", "none"].includes(body.dictionary)) throw badRequest('dictionary deve ser "all" ou "none".');
  res.json({ user: await UsersAdmin.updateUserCounters(readActor(req), req.params.id, { actions, dictionary: body.dictionary }, readReason(body)) });
}

/** PUT /admin/api/v1/users/:id/activities/:activityId — {completed, bestScore?, reason} → {user}. */
export async function setActivity(req, res) {
  const body = req.body ?? {};
  const completed = readBoolean(body.completed, "Concluída");
  if (completed === undefined) throw badRequest("Informe completed: true ou false.");
  const bestScore = body.bestScore === undefined ? 100 : readInteger(body.bestScore, "Nota", { min: 0, max: 100 });
  res.json({ user: await UsersAdmin.setUserActivity(readActor(req), req.params.id, req.params.activityId, { completed, bestScore }, readReason(body)) });
}

/** PUT /admin/api/v1/users/:id/achievements/:key — {mode: "granted"|"revoked"|"auto", reason} → {user}. */
export async function setAchievement(req, res) {
  res.json({ user: await UsersAdmin.setUserAchievement(readActor(req), req.params.id, req.params.key, req.body?.mode, readReason(req.body)) });
}

/** POST /admin/api/v1/users/:id/reset-progress — {reason} → {user}. */
export async function resetProgress(req, res) {
  res.json({ user: await UsersAdmin.resetUserProgress(readActor(req), req.params.id, readReason(req.body)) });
}
