import mongoose from "mongoose";
import { isDevelopment } from "../config/env.js";
import { MESSAGES } from "../config/messages.js";

/**
 * Responde 404 {error} para rotas que não existem. Registrado depois das rotas em app.js.
 */
export function notFoundHandler(_req, res) {
  res.status(404).json({ error: MESSAGES.general.routeNotFound });
}

/**
 * Escolhe o status HTTP de um erro: HttpError mantém o seu; JSON inválido, id inválido e
 * validação do Mongoose viram 400; o resto, 500.
 * @param {Error} error
 * @returns {number}
 */
function readStatus(error) {
  if (error.status) return error.status;
  if (error.type === "entity.parse.failed") return 400;
  if (error instanceof mongoose.Error.CastError) return 400;
  if (error instanceof mongoose.Error.ValidationError) return 400;
  return 500;
}

/**
 * Mensagem segura para o usuário (nunca expõe detalhes internos em erros 500).
 * @param {Error} error
 * @param {number} status
 * @returns {string}
 */
function readPublicMessage(error, status) {
  if (error.type === "entity.parse.failed") return MESSAGES.general.invalidJson;
  if (error instanceof mongoose.Error.CastError) return MESSAGES.general.invalidId;
  if (error instanceof mongoose.Error.ValidationError) return MESSAGES.general.invalidData;
  // 5xx com código de propósito (manutenção, e-mail que não saiu) já traz uma mensagem para a pessoa.
  if (status >= 500 && !error.extra?.code) return MESSAGES.general.internalError;
  return error.message;
}

/**
 * Último middleware: transforma qualquer erro em {error} com o status certo e registra os 500 no console.
 * Em desenvolvimento, inclui "details" nos erros 500.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(error, _req, res, _next) {
  const status = readStatus(error);
  // Manutenção é um 503 esperado (o app mostra o pop-up): não é erro do servidor para o log.
  if (status >= 500 && error.extra?.code !== "maintenance") console.error(error);

  const body = { error: readPublicMessage(error, status) };
  // extra só existe em HttpError lançado de propósito (ex.: conta banida, e-mail que não saiu).
  if (error.extra) Object.assign(body, error.extra);
  if (isDevelopment() && status >= 500) body.details = error.message;
  res.status(status).json(body);
}
