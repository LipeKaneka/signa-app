import * as ChatService from "../services/service-chat.js";
import { readRequiredString } from "../utils/util-validators.js";
import { badRequest } from "../utils/util-http-error.js";

const MAX_HISTORY_MESSAGES = 10;

/**
 * Valida o histórico enviado pelo app: só papéis user/assistant, textos curtos, no máximo 10,
 * começando por "user" (formato exigido pela API da IA).
 * @returns {{role: string, content: string}[]}
 * @throws {HttpError} 400 se inválido.
 */
function readHistory(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw badRequest("Histórico inválido.");

  const messages = value.slice(-MAX_HISTORY_MESSAGES).map((message) => {
    if (!["user", "assistant"].includes(message?.role)) throw badRequest("Histórico inválido.");
    return { role: message.role, content: readRequiredString(message.content, "a mensagem", 2000) };
  });
  while (messages.length > 0 && messages[0].role !== "user") messages.shift();
  return messages;
}

/**
 * POST /chat — valida {question, history?}; responde {answer, signs, source}.
 */
export async function askAssistant(req, res) {
  const question = readRequiredString(req.body?.question, "a pergunta", 1000);
  const history = readHistory(req.body?.history);

  const reply = await ChatService.askAssistant(question, history);
  res.json(reply);
}
