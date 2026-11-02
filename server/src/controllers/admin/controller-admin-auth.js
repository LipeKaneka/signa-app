import * as AdminAuthService from "../../services/service-admin-auth.js";
import { ADMIN_COOKIE, readActor } from "../../middlewares/admin-auth-middleware.js";
import { describePermissions } from "../../config/admin-permissions.js";
import { getEnvironment } from "../../config/env.js";
import { recordAudit } from "../../services/service-audit.js";
import { readEmail, readRequiredString, readAdminPassword } from "../../utils/util-validators.js";

/**
 * Opções do cookie de sessão: inacessível ao JavaScript (httpOnly), só no mesmo site (Strict) e só em /admin.
 * @param {Date} [expires]
 * @returns {import("express").CookieOptions}
 */
function cookieOptions(expires) {
  return { httpOnly: true, sameSite: "strict", secure: getEnvironment().adminCookieSecure, path: "/admin", expires };
}

/** POST /admin/api/v1/auth/login — {email, password} → cookie de sessão + {admin, permissions}. */
export async function login(req, res) {
  const { token, expiresAt, admin } = await AdminAuthService.signInAdmin({
    email: readEmail(req.body?.email),
    password: readRequiredString(req.body?.password, "a senha", 128),
    ip: req.ip ?? null,
    userAgent: req.get("User-Agent") ?? null,
  });
  res.cookie(ADMIN_COOKIE, token, cookieOptions(expiresAt));
  res.json({ admin, permissions: describePermissions(admin.role), expiresAt });
}

/** POST /admin/api/v1/auth/logout — encerra a sessão e apaga o cookie. */
export async function logout(req, res) {
  await AdminAuthService.endAdminSession(req.adminSession);
  await recordAudit(readActor(req), { action: "logout", entity: "admin", entityId: req.admin._id, summary: "Saiu do painel" });
  res.clearCookie(ADMIN_COOKIE, cookieOptions());
  res.json({ ok: true });
}

/** GET /admin/api/v1/auth/me — {admin, permissions, expiresAt} (o painel monta o menu a partir daqui). */
export function me(req, res) {
  res.json({
    admin: AdminAuthService.toPublicAdmin(req.admin),
    permissions: describePermissions(req.admin.role),
    expiresAt: req.adminSession.expiresAt,
  });
}

/** POST /admin/api/v1/auth/password — {currentPassword, newPassword}; derruba as outras sessões. */
export async function changePassword(req, res) {
  await AdminAuthService.changeOwnPassword(readActor(req), req.body?.currentPassword, readAdminPassword(req.body?.newPassword));
  res.json({ ok: true });
}
