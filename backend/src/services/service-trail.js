import { callServer, userPath } from "../clients/server-client.js";

/**
 * Trilha do usuário com o status de cada módulo e atividade (calculada no servidor).
 * @param {string} userId - id interno (do token).
 * @returns {Promise<object[]>} módulos.
 * Usado por: GET /trail.
 */
export async function buildTrail(userId) {
  const { modules } = await callServer(userPath(userId, "/trail"));
  return modules;
}
