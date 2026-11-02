import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { AdminModel } from "../models/model-admin.js";
import { AdminSessionModel } from "../models/model-admin-session.js";
import { PASSWORD_RULES } from "../config/rules.js";
import { getEnvironment } from "../config/env.js";
import { HttpError, unauthorized, forbidden } from "../utils/util-http-error.js";
import { recordAudit } from "./service-audit.js";

/** Limites de tentativas de login erradas numa janela de tempo (protege contra adivinhação de senha). */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 20;
const MAX_TRACKED_KEYS = 10000;
const failures = new Map();

/** Hash qualquer para comparar quando o e-mail não existe (o tempo de resposta não revela quem tem conta). */
let dummyHashPromise = null;
const readDummyHash = () => (dummyHashPromise ??= bcrypt.hash(randomBytes(16).toString("hex"), PASSWORD_RULES.BCRYPT_ROUNDS));

/**
 * SHA-256 do token de sessão (o banco guarda só isto).
 * @param {string} token
 * @returns {string}
 */
function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Quantas falhas recentes uma chave (e-mail ou IP) acumulou; esquece as antigas.
 * @param {string} key
 * @param {number} now
 * @returns {number}
 */
function countRecentFailures(key, now) {
  const entry = failures.get(key);
  if (!entry || now - entry.firstAt > LOGIN_WINDOW_MS) {
    failures.delete(key);
    return 0;
  }
  return entry.count;
}

/**
 * Soma uma falha de login para a chave.
 * @param {string} key
 * @param {number} now
 */
function registerFailure(key, now) {
  if (failures.size > MAX_TRACKED_KEYS) {
    for (const [trackedKey, entry] of failures) if (now - entry.firstAt > LOGIN_WINDOW_MS) failures.delete(trackedKey);
  }
  const count = countRecentFailures(key, now);
  failures.set(key, { count: count + 1, firstAt: count === 0 ? now : failures.get(key).firstAt });
}

/**
 * Dados do administrador que podem sair na API (nunca o hash da senha).
 * @param {object} admin
 * @returns {{id: string, email: string, name: string, role: string, status: string, lastLogin: Date|null, createdAt: Date}}
 */
export function toPublicAdmin(admin) {
  return {
    id: String(admin._id),
    email: admin.email,
    name: admin.name,
    role: admin.role,
    status: admin.status,
    lastLogin: admin.lastLogin,
    createdAt: admin.createdAt,
  };
}

/**
 * Login no painel: confere a senha e abre uma sessão.
 * @param {{email: string, password: string, ip: string|null, userAgent: string|null}} data
 * @returns {Promise<{token: string, expiresAt: Date, admin: object}>} token vai só no cookie httpOnly.
 * @throws {HttpError} 429 com tentativas demais; 401 credenciais erradas (mesma mensagem para e-mail e senha);
 *   403 conta desativada.
 * Usado por: POST /admin/api/v1/auth/login.
 */
export async function signInAdmin({ email, password, ip, userAgent }) {
  const now = Date.now();
  const emailKey = `email:${email}`;
  const ipKey = `ip:${ip}`;
  if (countRecentFailures(emailKey, now) >= MAX_FAILURES_PER_EMAIL || countRecentFailures(ipKey, now) >= MAX_FAILURES_PER_IP) {
    throw new HttpError(429, "Muitas tentativas de login. Espere 15 minutos e tente de novo.");
  }

  const admin = await AdminModel.findOne({ email }).select("+passwordHash");
  const passwordMatches = await bcrypt.compare(password, admin ? admin.passwordHash : await readDummyHash());
  if (!admin || !passwordMatches) {
    registerFailure(emailKey, now);
    registerFailure(ipKey, now);
    await recordAudit({ admin: null, ip }, { action: "login_failed", entity: "admin", summary: `Login recusado para ${email}` });
    throw unauthorized("E-mail ou senha incorretos.");
  }
  if (admin.status !== "active") throw forbidden("Conta do painel desativada.");

  failures.delete(emailKey);
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(now + getEnvironment().adminSessionHours * 60 * 60 * 1000);
  await AdminSessionModel.create({ tokenHash: hashToken(token), admin: admin._id, expiresAt, ip, userAgent: userAgent?.slice(0, 300) ?? null });
  admin.lastLogin = new Date(now);
  await admin.save();
  await recordAudit({ admin, ip }, { action: "login", entity: "admin", entityId: admin._id, summary: "Entrou no painel" });
  return { token, expiresAt, admin: toPublicAdmin(admin) };
}

/**
 * Sessão válida pelo token do cookie: não vencida e de um administrador ativo.
 * @param {string|undefined} token
 * @returns {Promise<{session: object, admin: object}|null>} null se não houver sessão válida.
 * Usado por: requireAdmin (admin-auth-middleware.js).
 */
export async function findAdminSession(token) {
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return null;
  const session = await AdminSessionModel.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }).lean();
  if (!session) return null;
  const admin = await AdminModel.findById(session.admin).lean();
  if (!admin || admin.status !== "active") return null;
  return { session, admin };
}

/**
 * Encerra uma sessão (logout).
 * @param {object} session
 * @returns {Promise<void>}
 */
export async function endAdminSession(session) {
  await AdminSessionModel.deleteOne({ _id: session._id });
}

/**
 * Encerra todas as sessões de um administrador (troca de senha, desativação, mudança de papel).
 * @param {unknown} adminId
 * @param {unknown} [exceptSessionId] - sessão que continua (a de quem trocou a própria senha).
 * @returns {Promise<void>}
 */
export async function endAllAdminSessions(adminId, exceptSessionId = null) {
  const filter = { admin: adminId };
  if (exceptSessionId) filter._id = { $ne: exceptSessionId };
  await AdminSessionModel.deleteMany(filter);
}

/**
 * Hash bcrypt de uma senha do painel (já validada com readAdminPassword).
 * @param {string} password
 * @returns {Promise<string>}
 */
export function hashAdminPassword(password) {
  return bcrypt.hash(password, PASSWORD_RULES.BCRYPT_ROUNDS);
}

/**
 * Troca a própria senha (exige a atual) e derruba as outras sessões.
 * @param {{admin: object, session: object, ip: string|null}} actor
 * @param {string} currentPassword
 * @param {string} newPassword - já validada.
 * @returns {Promise<void>}
 * @throws {HttpError} 401 se a senha atual estiver errada.
 */
export async function changeOwnPassword(actor, currentPassword, newPassword) {
  const admin = await AdminModel.findById(actor.admin._id).select("+passwordHash");
  if (typeof currentPassword !== "string" || !(await bcrypt.compare(currentPassword, admin.passwordHash))) {
    throw unauthorized("Senha atual incorreta.");
  }
  admin.passwordHash = await hashAdminPassword(newPassword);
  await admin.save();
  await endAllAdminSessions(admin._id, actor.session._id);
  await recordAudit(actor, { action: "change_password", entity: "admin", entityId: admin._id, summary: "Trocou a própria senha" });
}

/** Esquece as tentativas de login contadas (usado pelos testes). */
export function resetLoginFailures() {
  failures.clear();
}
