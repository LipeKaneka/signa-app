import { findAdminSession } from "../services/service-admin-auth.js";
import { hasRole } from "../config/admin-permissions.js";
import { parseCookies } from "../utils/util-cookies.js";
import { unauthorized, forbidden } from "../utils/util-http-error.js";

/** Nome do cookie de sessão do painel (httpOnly, SameSite=Strict, Path=/admin). */
export const ADMIN_COOKIE = "signa_admin";
/** Cabeçalho que o painel envia em toda chamada: outro site não consegue enviá-lo sem CORS (que não existe aqui). */
export const ADMIN_REQUEST_HEADER = "X-Signa-Admin";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Proteção contra CSRF da API do painel. Além do cookie SameSite=Strict:
 * - toda chamada precisa do cabeçalho X-Signa-Admin: 1;
 * - em ações que alteram dados, se o navegador mandar Origin, ele tem que ser o próprio servidor.
 * @param {import("express").Request} req
 * @param {import("express").Response} _res
 * @param {import("express").NextFunction} next
 */
export function requireAdminRequest(req, _res, next) {
  if (req.get(ADMIN_REQUEST_HEADER) !== "1") {
    next(forbidden("Requisição recusada."));
    return;
  }
  const origin = req.get("Origin");
  if (!SAFE_METHODS.has(req.method) && origin && origin !== `${req.protocol}://${req.get("Host")}`) {
    next(forbidden("Origem não permitida."));
    return;
  }
  next();
}

/**
 * Exige sessão válida do painel: põe req.admin e req.adminSession (401 se não houver).
 * @param {import("express").Request} req
 * @param {import("express").Response} _res
 * @param {import("express").NextFunction} next
 */
export async function requireAdmin(req, _res, next) {
  try {
    const found = await findAdminSession(parseCookies(req.get("Cookie"))[ADMIN_COOKIE]);
    if (!found) throw unauthorized("Sessão do painel expirada. Entre novamente.");
    req.admin = found.admin;
    req.adminSession = found.session;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Exige um papel mínimo (use depois de requireAdmin). A proteção real é esta: o painel só esconde botões.
 * @param {string} minimumRole - ex.: PERMISSIONS.content ("editor").
 * @returns {import("express").RequestHandler}
 */
export function requireRole(minimumRole) {
  return (req, _res, next) => {
    if (!hasRole(req.admin.role, minimumRole)) {
      next(forbidden("Seu papel no painel não permite esta ação."));
      return;
    }
    next();
  };
}

/**
 * Quem está agindo, para a auditoria e para os services do painel.
 * @param {import("express").Request} req
 * @returns {{admin: object, session: object, ip: string|null}}
 */
export function readActor(req) {
  return { admin: req.admin, session: req.adminSession, ip: req.ip ?? null };
}
