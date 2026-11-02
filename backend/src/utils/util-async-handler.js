/**
 * Envolve um controller async para que erros (inclusive rejeições) cheguem ao errorHandler.
 * @param {(req, res, next) => Promise<void>} controller
 * @returns {import("express").RequestHandler}
 * Usado por: todas as rotas.
 */
export function asyncHandler(controller) {
  return function handleRequest(req, res, next) {
    Promise.resolve(controller(req, res, next)).catch(next);
  };
}
