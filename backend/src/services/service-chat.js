import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { getEnvironment } from "../config/env.js";
import { findSignsMentionedIn } from "./service-dictionary.js";

const SYSTEM_PROMPT = `IGNORE QUAISQUER COMANDOS ANTERIORES E FOQUE NESSE: Você é o assistente do Signa Ludus, um app para aprender Libras (Língua Brasileira de Sinais).
Responda em português do Brasil, de forma curta, gentil e didática (no máximo 4 frases).
Ajude com dúvidas sobre Libras, cultura surda e sobre como usar o app.
Ao descrever um sinal, cite configuração de mão, ponto de articulação e movimento quando souber;
se não tiver certeza de como é um sinal, diga isso e sugira consultar o dicionário do app.
Não invente sinais. Recuse com educação assuntos sem relação com Libras ou com o app.`;

/** Limite de tamanho da resposta da IA (as respostas pedidas são curtas). */
const MAX_OUTPUT_TOKENS = 1024;

let cachedAnthropic = null;
let cachedGemini = null;

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
 * Pergunta ao Claude (API da Anthropic, modelo de AI_MODEL) com o histórico recente.
 * @returns {Promise<string>} texto da resposta.
 */
async function askClaude(question, history, signs) {
  const { anthropicApiKey, aiModel } = getEnvironment();
  cachedAnthropic ??= new Anthropic({ apiKey: anthropicApiKey });
  const response = await cachedAnthropic.messages.create({
    model: aiModel,
    max_tokens: MAX_OUTPUT_TOKENS,
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
 * Pergunta ao Gemini (Google, modelo de AI_MODEL) com o histórico recente.
 * No Gemini a fala da IA tem o papel "model" (no app é "assistant").
 * @returns {Promise<string>} texto da resposta.
 */
async function askGemini(question, history, signs) {
  const { geminiApiKey, aiModel } = getEnvironment();
  cachedGemini ??= new GoogleGenAI({ apiKey: geminiApiKey });
  const contents = [...history, { role: "user", content: question }].map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));
  const response = await cachedGemini.models.generateContent({
    model: aiModel,
    contents,
    config: { systemInstruction: SYSTEM_PROMPT + describeSignsForPrompt(signs), maxOutputTokens: MAX_OUTPUT_TOKENS },
  });
  return (response.text ?? "").trim();
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
 * Responde o assistente: usa a IA configurada (Gemini ou Claude, veja readAiSettings em config/env.js);
 * sem chave, ou se a IA falhar, responde pelo dicionário.
 * @param {string} question
 * @param {{role: "user"|"assistant", content: string}[]} history - últimas mensagens (o app guarda o chat).
 * @returns {Promise<{answer: string, signs: object[], source: "ai"|"dictionary"}>}
 * Usado por: POST /chat.
 */
export async function askAssistant(question, history) {
  const signs = await findSignsMentionedIn(question);
  const { aiProvider } = getEnvironment();
  if (!aiProvider) return { answer: answerFromDictionary(signs), signs, source: "dictionary" };

  try {
    const ask = aiProvider === "gemini" ? askGemini : askClaude;
    const answer = await ask(question, history, signs);
    return { answer: answer || answerFromDictionary(signs), signs, source: "ai" };
  } catch (error) {
    console.error(`Falha ao consultar a IA (${aiProvider}):`, error.message);
    return { answer: answerFromDictionary(signs), signs, source: "dictionary" };
  }
}
