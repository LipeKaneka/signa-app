import { readUserIdFromToken } from "../utils/util-tokens.js";
import { unauthorized } from "../utils/util-http-error.js";
import { checkSession } from "../services/service-user.js";

/**
 * Por quanto tempo uma conta conferida no servidor vale sem nova consulta. Curto o bastante para um
 * bloqueio feito no painel valer rápido; longo o bastante para não consultar o servidor a cada toque.
 */
const SESSION_CACHE_MS = 30 * 1000;
const checkedSessions = new Map();

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
async function ensureActiveSession(userId) {
  const checkedAt = checkedSessions.get(userId);
  if (checkedAt && Date.now() - checkedAt < SESSION_CACHE_MS) return;
  try {
    await checkSession(userId);
    checkedSessions.set(userId, Date.now());
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
 * Middleware: exige token JWT válido (conferido aqui, no backend) e conta ativa (conferida no servidor);
 * coloca o id interno do usuário em req.userId.
 * Responde 401 (sem token, token inválido, conta apagada) ou 403 (conta bloqueada).
 * @param {import("express").Request} req
 * @param {import("express").Response} _res
 * @param {import("express").NextFunction} next
 * Usado por: todas as rotas autenticadas (perfil, trilha, tentativas, ranking, dicionário, chat).
 */
export async function requireAuth(req, _res, next) {
  try {
    const token = readBearerToken(req);
    const userId = token ? readUserIdFromToken(token) : null;
    if (!userId) throw unauthorized();

    await ensureActiveSession(userId);
    req.userId = userId;
    next();
  } catch (error) {
    next(error);
  }
}
