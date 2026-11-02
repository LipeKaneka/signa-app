import { SettingModel } from "../models/model-setting.js";
import { SETTING_DEFINITIONS } from "../config/setting-definitions.js";
import { PROGRESS_RULES } from "../config/rules.js";
import { createTimedCache } from "../utils/util-timed-cache.js";
import { badRequest } from "../utils/util-http-error.js";

const SETTINGS_CACHE_MS = 10 * 1000;
const cache = createTimedCache(SETTINGS_CACHE_MS);
const definitionsByKey = new Map(SETTING_DEFINITIONS.map((definition) => [definition.key, definition]));

/**
 * Valores salvos no banco para as chaves conhecidas (as desconhecidas são ignoradas).
 * @returns {Promise<Map<string, unknown>>}
 */
function loadStoredValues() {
  return cache.get("all", async () => {
    const stored = await SettingModel.find({ key: { $in: [...definitionsByKey.keys()] } }).lean();
    return new Map(stored.map((setting) => [setting.key, setting.value]));
  });
}

/**
 * Valor de uma configuração: o do banco, ou o padrão do código se não houver.
 * @param {string} key - uma chave de SETTING_DEFINITIONS (ex.: "progress.minScoreToPass").
 * @returns {Promise<unknown>}
 * @throws {Error} se a chave não estiver em SETTING_DEFINITIONS (erro de programação).
 */
export async function getSetting(key) {
  const definition = definitionsByKey.get(key);
  if (!definition) throw new Error(`Configuração desconhecida: ${key}`);
  const stored = await loadStoredValues();
  return stored.has(key) ? stored.get(key) : definition.default;
}

/**
 * Regras de pontuação valendo agora: PROGRESS_RULES do código com o que foi trocado no banco por cima.
 * Mesmo formato de PROGRESS_RULES (XP_PER_CORRECT_ANSWER, MIN_SCORE_TO_PASS…).
 * @returns {Promise<typeof PROGRESS_RULES>}
 * Usado por: service-attempt.js (XP, aprovação, expiração).
 */
export async function getProgressRules() {
  const stored = await loadStoredValues();
  const rules = { ...PROGRESS_RULES };
  for (const definition of SETTING_DEFINITIONS) {
    if (definition.rule && stored.has(definition.key)) rules[definition.rule] = stored.get(definition.key);
  }
  return rules;
}

/**
 * Configurações públicas (as marcadas com public: true), para o app.
 * @returns {Promise<Record<string, unknown>>} chave -> valor.
 * Usado por: GET /internal/v1/app-config.
 */
export async function getPublicSettings() {
  const stored = await loadStoredValues();
  return Object.fromEntries(
    SETTING_DEFINITIONS.filter((definition) => definition.public).map((definition) => [
      definition.key,
      stored.has(definition.key) ? stored.get(definition.key) : definition.default,
    ]),
  );
}

/** Limites de cada frase da folha de resposta. */
const PHRASE_TITLE_MAX = 40;
const PHRASE_TEXT_MAX = 90;

/**
 * Valida uma lista de frases ({title, text}) da folha de resposta.
 * @param {object} definition
 * @param {unknown} value
 * @returns {{title: string, text: string}[]}
 * @throws {HttpError} 400 se vazia, grande demais ou com frase inválida.
 */
function readPhrases(definition, value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > definition.maxItems) {
    throw badRequest(`${definition.label}: envie de 1 a ${definition.maxItems} frases.`);
  }
  return value.map((phrase, index) => {
    const title = typeof phrase?.title === "string" ? phrase.title.trim() : "";
    const text = typeof phrase?.text === "string" ? phrase.text.trim() : "";
    if (!title || title.length > PHRASE_TITLE_MAX || text.length > PHRASE_TEXT_MAX) {
      throw badRequest(`Frase ${index + 1}: título de 1 a ${PHRASE_TITLE_MAX} caracteres e texto de até ${PHRASE_TEXT_MAX}.`);
    }
    return { title, text };
  });
}

/**
 * Confere se um valor é aceito pela definição da chave.
 * @param {object} definition
 * @param {unknown} value
 * @returns {unknown} valor normalizado.
 * @throws {HttpError} 400 se inválido.
 */
function validateSettingValue(definition, value) {
  if (definition.type === "integer") {
    if (!Number.isInteger(value) || value < definition.min || value > definition.max) {
      throw badRequest(`${definition.label}: use um número inteiro entre ${definition.min} e ${definition.max}.`);
    }
    return value;
  }
  if (definition.type === "phrases") return readPhrases(definition, value);
  if (typeof value !== "string" || value.trim() === "" || value.length > definition.maxLength) {
    throw badRequest(`${definition.label}: texto de 1 a ${definition.maxLength} caracteres.`);
  }
  return value.trim();
}

/**
 * Salva uma configuração (validada) e limpa o cache para valer na hora.
 * @param {string} key
 * @param {unknown} value
 * @param {string|null} [updatedBy] - quem alterou (id do administrador), para auditoria.
 * @returns {Promise<unknown>} valor salvo.
 * @throws {HttpError} 400 se a chave for desconhecida ou o valor inválido.
 * Usado por: painel (Etapa 5) e testes.
 */
export async function setSetting(key, value, updatedBy = null) {
  const definition = definitionsByKey.get(key);
  if (!definition) throw badRequest(`Configuração desconhecida: ${key}.`);
  const normalized = validateSettingValue(definition, value);
  await SettingModel.updateOne({ key }, { $set: { value: normalized, updatedBy } }, { upsert: true });
  cache.clear();
  return normalized;
}

/** Esquece os valores em cache (depois de alterar o banco por fora deste service). */
export function clearSettingsCache() {
  cache.clear();
}
