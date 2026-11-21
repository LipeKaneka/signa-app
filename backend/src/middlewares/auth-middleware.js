import { readUserIdFromToken } from "../utils/util-tokens.js";
import { unauthorized } from "../utils/util-http-error.js";
import { checkSession } from "../services/service-user.js";

/**
 * Por quanto tempo uma conta conferida no servidor vale sem nova consulta. Curto o bastante para um
 * bloqueio feito no painel valer rápido; longo o bastante para não consultar o servidor a cada toque.
 */
const SESSION_CACHE_MS = 15 * 1000;
/** Acima disso, as conferências vencidas são apagadas (o mapa não cresce sem limite com muitas contas). */
const MAX_CHECKED_SESSIONS = 5000;
const checkedSessions = new Map();

/** Guarda que a conta acabou de ser confirmada ativa (por uma conferência ou por uma rota de usuário do servidor). */
function rememberActiveSession(userId) {
  checkedSessions.set(userId, Date.now());
  if (checkedSessions.size <= MAX_CHECKED_SESSIONS) return;
  const now = Date.now();
  for (const [id, checkedAt] of checkedSessions) if (now - checkedAt >= SESSION_CACHE_MS) checkedSessions.delete(id);
}

/**
 * Extrai o token do cabeçalho "Authorization: Bearer <token>".
 * @param {import("express").Request} req
 * @returns {string|null}
 */
function readBearerToken(req) {
  const header = req.headers.authorization ?? "";
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" && token ? token : null;
}

/**
 * Confere (com cache curto) se a conta do token ainda existe e está ativa no servidor.
 * @param {string} userId
 * @returns {Promise<void>}
 * @throws {HttpError} 401/403 vindos do servidor.
 */
export async function ensureActiveSession(userId) {
  const checkedAt = checkedSessions.get(userId);
  if (checkedAt && Date.now() - checkedAt < SESSION_CACHE_MS) return;
  try {
    await checkSession(userId);
    rememberActiveSession(userId);
  } catch (error) {
    checkedSessions.delete(userId);
    throw error;
  }
}

/**
 * Esquece a sessão em cache (ex.: depois de excluir a conta).
 * @param {string} userId
 */
export function forgetSession(userId) {
  checkedSessions.delete(userId);
}

/**
 * Lê o id do usuário do token JWT (conferido aqui, no backend).
 * @throws {HttpError} 401 sem token ou com token inválido/vencido.
 */
function readAuthenticatedUserId(req) {
  const token = readBearerToken(req);
  const userId = token ? readUserIdFromToken(token) : null;
  if (!userId) throw unauthorized();
  return userId;
}

/**
 * Middleware: exige token JWT válido e conta ativa (conferida no servidor, com cache curto);
 * coloca o id interno do usuário em req.userId.
 * Responde 401 (sem token, token inválido, conta apagada) ou 403 (conta bloqueada).
 * Usado por: rotas que NÃO passam pelas rotas de usuário do servidor (dicionário, chat, fluxo de notificações).
 */
export async function requireAuth(req, _res, next) {
  try {
    const userId = readAuthenticatedUserId(req);
    await ensureActiveSession(userId);
    req.userId = userId;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware: exige só o token JWT válido. A conta é conferida pelo próprio servidor na mesma chamada (o loadUser das
 * rotas /internal/v1/users/:userId responde 401/403, que o backend repassa ao app), então não precisa da conferência
 * separada do requireAuth: uma ida ao servidor a menos por pedido. Resposta de sucesso também renova o cache da sessão.
 * Usado por: perfil, trilha, tentativas, ranking e notificações.
 */
export function requireToken(req, res, next) {
  try {
    const userId = readAuthenticatedUserId(req);
    req.userId = userId;
    res.on("finish", () => {
      if (res.statusCode < 400) rememberActiveSession(userId);
      else if (res.statusCode === 401 || res.statusCode === 403) checkedSessions.delete(userId);
    });
    next();
  } catch (error) {
    next(error);
  }
}
