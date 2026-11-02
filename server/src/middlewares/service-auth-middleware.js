import { timingSafeEqual } from "node:crypto";
import { getEnvironment } from "../config/env.js";
import { unauthorized } from "../utils/util-http-error.js";

/**
 * Compara dois textos em tempo constante (não revela, pelo tempo de resposta, quanto da chave acertou).
 * @param {string} received
 * @param {string} expected
 * @returns {boolean}
 */
function keysMatch(received, expected) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

/**
 * Middleware da API interna: só aceita quem envia a chave de serviço (o backend) em "X-Service-Key".
 * O APK nunca tem essa chave; o painel usa outra autenticação (/admin).
 * @param {import("express").Request} req
 * @param {import("express").Response} _res
 * @param {import("express").NextFunction} next
 */
export function requireServiceKey(req, _res, next) {
  const received = req.get("X-Service-Key") ?? "";
  if (!keysMatch(received, getEnvironment().serviceKey)) {
    next(unauthorized("Chave de serviço inválida."));
    return;
  }
  next();
}
