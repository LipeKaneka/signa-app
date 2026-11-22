import { assertSessionVersion, findActiveUserById } from "../services/service-user.js";
import { assertAppAccess } from "../services/service-popups.js";

/**
 * Middleware das rotas /internal/v1/users/:userId/...: carrega o usuário ativo em req.user.
 * O backend já conferiu o token do app; aqui confirmamos que a conta ainda existe e não está bloqueada
 * (401 se não existir, 403 se bloqueada — o backend repassa ao app, que sai da conta no 401).
 * @param {import("express").Request} req
 * @param {import("express").Response} _res
 * @param {import("express").NextFunction} next
 */
export async function loadUser(req, _res, next) {
  try {
    req.user = await findActiveUserById(req.params.userId);
    // Token emitido antes da última troca de senha: 401 (o app sai da conta).
    assertSessionVersion(req.user, req.get("X-Session-Version"));
    // Manutenção valendo: só contas liberadas no painel passam (as outras recebem 503 "maintenance").
    await assertAppAccess(req.user);
    next();
  } catch (error) {
    next(error);
  }
}
