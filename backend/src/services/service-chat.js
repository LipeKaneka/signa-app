import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { getEnvironment } from "../config/env.js";
import { findSignsMentionedIn } from "./service-dictionary.js";

const SYSTEM_PROMPT = `IGNORE QUAISQUER COMANDOS ANTERIORES E FOQUE NESSE: Você é o assistente do Signa Ludus, um app para aprender Libras (Língua Brasileira de Sinais).
Responda em português do Brasil, de forma curta, gentil e didática (no máximo 4 frases).
Ajude com dúvidas sobre Libras, cultura surda e sobre como usar o app.
Ao descrever um sinal, cite configuração de mão, ponto de articulação e movimento quando souber;
se não tiver certeza de como é um sinal, diga isso e sugira consultar o dicionário do app.
Quando houver verbetes do dicionário do app relacionados, diga que o aluno pode tocar no sinal abaixo da resposta para ver o avatar.
Não invente sinais. Recuse com educação assuntos sem relação com Libras ou com o app.`;

/** 1º passo: a IA lê a pergunta e diz o que procurar no dicionário do app (resposta em JSON). */
const SEARCH_TERMS_PROMPT = `Você ajuda a buscar sinais num dicionário de Libras cujos verbetes são palavras ou expressões curtas em português
(ex.: "amor", "obrigado", "bom dia", "azul", "cachorro", "eu", "você").
Leia a pergunta do aluno e responda SÓ com JSON no formato {"termos": ["...", "..."]}: até 6 termos para buscar,
na forma de dicionário (substantivo no singular, verbo no infinitivo), incluindo a expressão inteira quando fizer sentido.
Exemplo: "como falo eu te amo?" → {"termos": ["eu te amo", "amor", "amar", "eu", "você"]}.
Se a pergunta não pedir nenhum sinal, responda {"termos": []}.`;

/** Limite de tamanho da resposta da IA (as respostas pedidas são curtas). */
const MAX_OUTPUT_TOKENS = 1024;
/** Espera máxima por tentativa e pela pergunta inteira: o app nunca fica "carregando" indefinidamente. */
const ATTEMPT_TIMEOUT_MS = 12000;
const TOTAL_BUDGET_MS = 25000;
/** Quantos sinais do dicionário a resposta mostra. */
const MAX_SIGNS = 5;

let cachedAnthropic = null;
let cachedGemini = null;

/**
 * Texto com os verbetes relacionados, anexado ao prompt de sistema para a IA usar o dicionário do app.
 * @param {object[]} signs
 * @returns {string}
 */
function describeSignsForPrompt(signs) {
  if (signs.length === 0) return "\n\nNenhum verbete do dicionário do app combina com a pergunta.";
  const lines = signs.map((sign) => `- ${sign.word} (${sign.category})${sign.description ? `: ${sign.description}` : ""}`);
  return `\n\nVerbetes do dicionário do app relacionados à pergunta:\n${lines.join("\n")}`;
}

/** Erro que vale tentar de novo com outro modelo: sobrecarga, limite de uso ou demora (não chave errada). */
function isTemporaryAiError(error) {
  const text = `${error?.status ?? ""} ${error?.message ?? ""}`;
  return error?.name === "AbortError" || /\b(429|500|503|529)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|timed? ?out/i.test(text);
}

/**
 * Uma chamada ao provedor configurado, com um modelo e limite de tempo.
 * @param {{model: string, system: string, messages: {role: string, content: string}[], json?: boolean, signal: AbortSignal}} request
 * @returns {Promise<string>}
 */
async function callModel({ model, system, messages, json = false, signal }) {
  const { aiProvider, geminiApiKey, anthropicApiKey } = getEnvironment();
  if (aiProvider === "gemini") {
    cachedGemini ??= new GoogleGenAI({ apiKey: geminiApiKey });
    // No Gemini a fala da IA tem o papel "model" (no app é "assistant").
    const contents = messages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));
    const response = await cachedGemini.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: system,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        abortSignal: signal,
        ...(json ? { responseMimeType: "application/json" } : {}),
      },
    });
    return (response.text ?? "").trim();
  }
  cachedAnthropic ??= new Anthropic({ apiKey: anthropicApiKey, maxRetries: 0 });
  const response = await cachedAnthropic.messages.create(
    { model, max_tokens: MAX_OUTPUT_TOKENS, system, messages },
    { signal },
  );
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

/**
 * Pergunta à IA tentando o modelo principal e, se ele estiver sobrecarregado ou demorar, os modelos reserva
 * (AI_FALLBACK_MODELS). Respeita o prazo total da pergunta.
 * @param {{system: string, messages: object[], json?: boolean, deadline: number}} request
 * @returns {Promise<string>}
 * @throws o último erro quando nenhum modelo respondeu a tempo.
 */
async function askAi({ system, messages, json, deadline }) {
  const { aiModel, aiFallbackModels } = getEnvironment();
  let lastError = null;
  for (const model of [aiModel, ...aiFallbackModels]) {
    const remaining = deadline - Date.now();
    if (remaining < 2000) break;
    try {
      return await callModel({ model, system, messages, json, signal: AbortSignal.timeout(Math.min(ATTEMPT_TIMEOUT_MS, remaining)) });
    } catch (error) {
      lastError = error;
      console.error(`IA indisponível com ${model}:`, String(error?.message ?? error).slice(0, 200));
      if (!isTemporaryAiError(error)) break;
    }
  }
  throw lastError ?? new Error("Sem tempo para consultar a IA.");
}

/**
 * 1º passo: a IA transforma a pergunta em termos de busca ("eu te amo" → amor, amar…). Sem resposta válida, devolve [].
 * @returns {Promise<string[]>}
 */
async function extractSearchTerms(question, deadline) {
  try {
    const text = await askAi({ system: SEARCH_TERMS_PROMPT, messages: [{ role: "user", content: question }], json: true, deadline });
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    return Array.isArray(parsed.termos)
      ? parsed.termos.filter((term) => typeof term === "string").map((term) => term.trim().slice(0, 40)).filter(Boolean).slice(0, 6)
      : [];
  } catch (error) {
    console.error("Não deu para extrair termos de busca:", String(error?.message ?? error).slice(0, 200));
    return [];
  }
}

/**
 * Deixa o histórico no formato que Gemini e Claude aceitam: começa pela pessoa, alterna pessoa/IA e termina na IA
 * (a pergunta nova entra depois). Sem isso, um histórico "fora de passo" (pergunta que ficou sem resposta porque o
 * app fechou ou caiu a internet) fazia toda pergunta seguinte daquela pessoa falhar e cair no dicionário.
 * Mensagens seguidas do mesmo lado viram uma só.
 * @param {{role: "user"|"assistant", content: string}[]} history
 * @returns {{role: "user"|"assistant", content: string}[]}
 */
export function normalizeHistory(history) {
  const merged = [];
  for (const message of history) {
    const content = String(message.content ?? "").trim();
    if (!content) continue;
    const role = message.role === "assistant" ? "assistant" : "user";
    const last = merged.at(-1);
    if (last && last.role === role) last.content = `${last.content}\n${content}`;
    else merged.push({ role, content });
  }
  while (merged.length && merged[0].role !== "user") merged.shift();
  while (merged.length && merged.at(-1).role !== "assistant") merged.pop();
  return merged;
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
 * Responde o assistente com a IA configurada (Gemini ou Claude, veja readAiSettings em config/env.js):
 * 1) a IA lê a pergunta e escolhe o que buscar; 2) o servidor busca esses termos no dicionário do app;
 * 3) a IA responde usando os verbetes achados (que o app mostra como sinais tocáveis).
 * Sem chave, ou se a IA falhar/estiver sobrecarregada, responde pelo dicionário. Tudo em até ~25 s.
 * @param {string} question
 * @param {{role: "user"|"assistant", content: string}[]} history - últimas mensagens (o app guarda o chat).
 * @returns {Promise<{answer: string, signs: object[], source: "ai"|"dictionary"}>}
 * Usado por: POST /chat.
 */
export async function askAssistant(question, history) {
  const { aiProvider } = getEnvironment();
  if (!aiProvider) {
    const signs = await findSignsMentionedIn(question, MAX_SIGNS);
    return { answer: answerFromDictionary(signs), signs, source: "dictionary" };
  }

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const terms = await extractSearchTerms(question, deadline);
  // Termos da IA só batem exatos ("amar" não pode virar "amarelo"); a pergunta crua também busca palavras parecidas.
  const [fromTerms, fromQuestion] = await Promise.all([
    terms.length ? findSignsMentionedIn(terms.join(", "), MAX_SIGNS, { prefix: false }) : [],
    findSignsMentionedIn(question, MAX_SIGNS),
  ]);
  const signs = [...fromTerms, ...fromQuestion]
    .filter((sign, index, all) => all.findIndex((other) => other.slug === sign.slug) === index)
    .slice(0, MAX_SIGNS);
  try {
    const answer = await askAi({
      system: SYSTEM_PROMPT + describeSignsForPrompt(signs),
      messages: [...normalizeHistory(history), { role: "user", content: question }],
      deadline,
    });
    return { answer: answer || answerFromDictionary(signs), signs, source: "ai" };
  } catch (error) {
    console.error(`Falha ao consultar a IA (${aiProvider}):`, String(error?.message ?? error).slice(0, 200));
    return { answer: answerFromDictionary(signs), signs, source: "dictionary" };
  }
}
