import { rateLimit } from "express-rate-limit";
import { getEnvironment } from "../config/env.js";

/**
 * Cria um limitador de requisições por IP.
 * @param {number} windowMinutes - janela de tempo.
 * @param {number|(() => number)} limit - máximo de requisições na janela (função = lido a cada requisição).
 * @param {string} message - texto devolvido em {error} quando estoura (429).
 * @returns {import("express").RequestHandler}
 */
function createLimiter(windowMinutes, limit, message) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: message },
  });
}

/** Login e cadastro: segura tentativas de adivinhar senha. */
export const authLimiter = createLimiter(15, 20, "Muitas tentativas. Aguarde alguns minutos.");

/** Assistente: cada pergunta pode custar uma chamada de IA. */
export const chatLimiter = createLimiter(1, 10, "Muitas perguntas seguidas. Aguarde um minuto.");

/** Geral, por IP: API_RATE_LIMIT_PER_MINUTE (padrão 300). */
export const apiLimiter = createLimiter(1, () => getEnvironment().apiRateLimitPerMinute, "Muitas requisições. Aguarde um pouco.");
