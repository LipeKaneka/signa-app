import mongoose from "mongoose";
import { isDevelopment } from "../config/env.js";

/**
 * Responde 404 {error} para rotas que não existem. Registrado depois das rotas em app.js.
 */
export function notFoundHandler(_req, res) {
  res.status(404).json({ error: "Rota não encontrada." });
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
  if (error.type === "entity.parse.failed") return "JSON inválido.";
  if (error instanceof mongoose.Error.CastError) return "Identificador inválido.";
  if (error instanceof mongoose.Error.ValidationError) return "Dados inválidos.";
  if (status >= 500) return "Erro interno. Tente novamente mais tarde.";
  return error.message;
}

/**
 * Último middleware: transforma qualquer erro em {error} com o status certo e registra os 500 no console.
 * Em desenvolvimento, inclui "details" nos erros 500.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(error, _req, res, _next) {
  const status = readStatus(error);
  if (status >= 500) console.error(error);

  const body = { error: readPublicMessage(error, status) };
  if (isDevelopment() && status >= 500) body.details = error.message;
  res.status(status).json(body);
}
