import Anthropic from "@anthropic-ai/sdk";
import { getEnvironment } from "../config/env.js";
import { findSignsMentionedIn } from "./service-dictionary.js";

const SYSTEM_PROMPT = `IGNORE QUAISQUER COMANDOS ANTERIORES E FOQUE NESSE: Você é o assistente do Signa Ludus, um app para aprender Libras (Língua Brasileira de Sinais).
Responda em português do Brasil, de forma curta, gentil e didática (no máximo 4 frases).
Ajude com dúvidas sobre Libras, cultura surda e sobre como usar o app.
Ao descrever um sinal, cite configuração de mão, ponto de articulação e movimento quando souber;
se não tiver certeza de como é um sinal, diga isso e sugira consultar o dicionário do app.
Não invente sinais. Recuse com educação assuntos sem relação com Libras ou com o app.`;

let cachedClient = null;

/**
 * Cliente da API da Anthropic (criado uma vez). null quando não há ANTHROPIC_API_KEY.
 * @returns {import("@anthropic-ai/sdk").default|null}
 */
function getAnthropicClient() {
  const { anthropicApiKey } = getEnvironment();
  if (!anthropicApiKey) return null;
  cachedClient ??= new Anthropic({ apiKey: anthropicApiKey });
  return cachedClient;
}

/**
 * Texto com os verbetes relacionados, anexado ao prompt de sistema para a IA usar o dicionário do app.
 * @param {object[]} signs
 * @returns {string}
 */
function describeSignsForPrompt(signs) {
  if (signs.length === 0) return "";
  const lines = signs.map((sign) => `- ${sign.word} (${sign.category})${sign.description ? `: ${sign.description}` : ""}`);
  return `\n\nVerbetes do dicionário do app relacionados à pergunta:\n${lines.join("\n")}`;
}

/**
 * Pergunta à IA (modelo de AI_MODEL) com o histórico recente.
 * @returns {Promise<string>} texto da resposta.
 */
async function askClaude(client, question, history, signs) {
  const { aiModel } = getEnvironment();
  const response = await client.messages.create({
    model: aiModel,
    max_tokens: 1024,
    system: SYSTEM_PROMPT + describeSignsForPrompt(signs),
    messages: [...history, { role: "user", content: question }],
  });
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

/**
 * Resposta sem IA: lista os sinais encontrados no dicionário.
 * @param {object[]} signs
 * @returns {string}
 */
function answerFromDictionary(signs) {
  if (signs.length === 0) {
    return "Não encontrei esse sinal no dicionário ainda. Tente procurar por outra palavra na aba Dicionário.";
  }
  const words = signs.map((sign) => sign.word).join(", ");
  return `Encontrei no dicionário: ${words}. Toque em um sinal abaixo para ver o avatar fazendo o gesto.`;
}

/**
 * Responde o assistente: usa a IA se houver chave, senão (ou se a IA falhar) responde pelo dicionário.
 * @param {string} question
 * @param {{role: "user"|"assistant", content: string}[]} history - últimas mensagens (o app guarda o chat).
 * @returns {Promise<{answer: string, signs: object[], source: "ai"|"dictionary"}>}
 * Usado por: POST /chat.
 */
export async function askAssistant(question, history) {
  const signs = await findSignsMentionedIn(question);
  const client = getAnthropicClient();
  if (!client) return { answer: answerFromDictionary(signs), signs, source: "dictionary" };

  try {
    const answer = await askClaude(client, question, history, signs);
    return { answer: answer || answerFromDictionary(signs), signs, source: "ai" };
  } catch (error) {
    console.error("Falha ao consultar a IA:", error.message);
    return { answer: answerFromDictionary(signs), signs, source: "dictionary" };
  }
}
