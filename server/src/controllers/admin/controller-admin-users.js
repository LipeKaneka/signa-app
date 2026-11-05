import * as UsersAdmin from "../../services/service-admin-users.js";
import { readActor } from "../../middlewares/admin-auth-middleware.js";
import { badRequest } from "../../utils/util-http-error.js";
import { readRequiredString, readOptionalString, readPositiveInteger, readInteger } from "../../utils/util-validators.js";

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

/** POST /admin/api/v1/users/:id/xp — {delta, reason} → {user}. */
export async function adjustXp(req, res) {
  const delta = readInteger(req.body?.delta, "Ajuste de XP", { min: -1_000_000, max: 1_000_000 });
  res.json({ user: await UsersAdmin.adjustUserXp(readActor(req), req.params.id, delta, readReason(req.body)) });
}

/** POST /admin/api/v1/users/:id/reset-progress — {reason} → {user}. */
export async function resetProgress(req, res) {
  res.json({ user: await UsersAdmin.resetUserProgress(readActor(req), req.params.id, readReason(req.body)) });
}
