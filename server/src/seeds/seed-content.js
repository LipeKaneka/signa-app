import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { SignModel } from "../models/model-sign.js";
import { ModuleModel } from "../models/model-module.js";
import { ActivityModel } from "../models/model-activity.js";
import { AchievementModel } from "../models/model-achievement.js";
import { LevelModel } from "../models/model-level.js";
import { DEFAULT_ACHIEVEMENTS } from "../config/achievements.js";
import { DEFAULT_LEVELS } from "../config/levels.js";
import { bumpContentVersion } from "../services/service-content-version.js";
import { clearAchievementsCache } from "../services/service-achievement.js";
import { clearLevelsCache } from "../services/service-level.js";
import { clearSettingsCache } from "../services/service-settings.js";
import { clearEventsCache } from "../services/service-event.js";
import { slugify } from "../utils/util-text.js";
import { splitAlphabetActivity } from "./migrate-split-alphabet.js";
import { CAMERA_CORRECT_OPTION, CAMERA_OPTIONS, findCameraTarget } from "../config/camera-targets.js";
import { VLIBRAS_SOURCE } from "../config/sign-source.js";

const OPTIONS_PER_QUESTION = 4;
const OPTION_IDS = ["a", "b", "c", "d"];


/**
 * Lê um JSON de src/seeds/data.
 */
async function readSeedFile(fileName) {
  const content = await readFile(new URL(`./data/${fileName}`, import.meta.url), "utf8");
  return JSON.parse(content);
}

/**
 * Gerador pseudoaleatório com semente: o seed sempre gera as mesmas alternativas (resultado reproduzível).
 * @param {number} seed
 * @returns {() => number} função que devolve números em [0, 1).
 */
function createSeededRandom(seed) {
  let state = seed;
  return function nextRandom() {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/**
 * Embaralha uma cópia da lista (Fisher-Yates) usando o gerador informado.
 * @returns {any[]}
 */
function shuffle(items, random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

/**
 * Cria os verbetes de data/signs.json que ainda não existem (pelo slug). $setOnInsert: edições feitas no
 * painel não são desfeitas ao rodar o seed de novo.
 * @returns {Promise<Map<string, object>>} slug -> documento.
 */
async function upsertSigns() {
  const signs = await readSeedFile("signs.json");
  const signsBySlug = new Map();
  for (const sign of signs) {
    const slug = slugify(sign.word);
    const saved = await SignModel.findOneAndUpdate(
      { slug },
      {
        $setOnInsert: {
          slug,
          word: sign.word,
          category: sign.category,
          description: sign.description ?? "",
          vlibrasGloss: sign.gloss,
          source: VLIBRAS_SOURCE,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    signsBySlug.set(slug, saved);
  }
  return signsBySlug;
}

/**
 * De onde saem as alternativas erradas: a lista da atividade (distractorPool), senão sinais da mesma categoria
 * (mais desafiador: letra com letra, cor com cor), senão qualquer sinal.
 * @param {object} sign
 * @param {object[]} allSigns
 * @param {object[]|null} activityPool
 * @returns {object[]}
 */
function pickDistractorPool(sign, allSigns, activityPool) {
  const others = (list) => list.filter((other) => other.slug !== sign.slug && other.word !== sign.word);
  if (activityPool && others(activityPool).length >= OPTIONS_PER_QUESTION - 1) return others(activityPool);
  const sameCategory = others(allSigns.filter((other) => other.category === sign.category));
  return sameCategory.length >= OPTIONS_PER_QUESTION - 1 ? sameCategory : others(allSigns);
}

/**
 * Pergunta de escolha: o avatar faz o sinal certo; alternativas = a palavra certa + 3 erradas, embaralhadas.
 * A explicação junta "Esse é o sinal de X", a dica do sinal (tips) e a nota da atividade (note), se houver.
 * @param {object} sign
 * @param {object[]} allSigns
 * @param {() => number} random
 * @param {number} questionIndex
 * @param {{prompt?: string, tip?: string, note?: string, activityPool?: object[]|null}} [extras]
 * @returns {object} pergunta no formato do ActivityModel.
 */
function buildSignChoiceQuestion(sign, allSigns, random, questionIndex, { prompt, tip, note, activityPool = null } = {}) {
  const distractors = shuffle(pickDistractorPool(sign, allSigns, activityPool), random).slice(0, OPTIONS_PER_QUESTION - 1);
  const words = shuffle([sign, ...distractors], random);
  const options = words.map((word, index) => ({ id: OPTION_IDS[index], text: word.word }));

  return {
    key: `q${questionIndex + 1}`,
    type: "sign_choice",
    prompt: prompt ?? "Qual sinal é esse?",
    sign: sign._id,
    options,
    correctOptionId: options[words.indexOf(sign)].id,
    explanation: [`Esse é o sinal de "${sign.word}".`, tip, note].filter(Boolean).join(" "),
  };
}

/**
 * Pergunta "Faça o sinal" (câmera): o app confere o gesto; o avatar aparece se o dicionário tiver o mesmo sinal.
 * @param {string} label - alvo de config/camera-targets.js (ex.: "A", "Banheiro").
 * @param {Map<string, object>} signsBySlug
 * @param {number} questionIndex
 * @param {{prompt?: string, note?: string}} [extras]
 * @returns {object} pergunta no formato do ActivityModel.
 */
function buildCameraQuestion(label, signsBySlug, questionIndex, { prompt, note } = {}) {
  const target = findCameraTarget(label);
  if (!target) throw new Error(`"${label}" não está na lista de sinais que a câmera reconhece (config/camera-targets.js)`);
  return {
    key: `q${questionIndex + 1}`,
    type: "camera_sign",
    prompt: prompt ?? (target.kind === "letter" ? `Faça a letra ${target.label} para a câmera` : `Faça o sinal de "${target.label}" para a câmera`),
    sign: signsBySlug.get(slugify(target.label))?._id ?? null,
    target: target.label,
    options: CAMERA_OPTIONS.map((option) => ({ ...option })),
    correctOptionId: CAMERA_CORRECT_OPTION,
    explanation: [`Esse é o sinal de "${target.label}".`, note].filter(Boolean).join(" "),
  };
}

/**
 * Cria a atividade do módulo (uma pergunta por sinal listado) se ela ainda não existir.
 * Atividade de câmera em trail.json: {"type": "camera", "targets": ["A", "E", ...]} em vez de "signs".
 * Campos opcionais da atividade em trail.json: prompt (enunciado), note (vai em toda explicação),
 * tips ({slug: dica} para sinais específicos), distractorPool (slugs de onde saem as alternativas erradas) e
 * questionsPerAttempt (sorteia essa quantidade de perguntas a cada tentativa, em ordem aleatória).
 */
async function upsertActivity(module, activityData, order, signsBySlug) {
  const allSigns = [...signsBySlug.values()];
  const findSign = (slug) => {
    const sign = signsBySlug.get(slug);
    if (!sign) throw new Error(`Sinal "${slug}" não existe em signs.json`);
    return sign;
  };
  const activityPool = activityData.distractorPool ? activityData.distractorPool.map(findSign) : null;
  const random = createSeededRandom(order * 7919 + module.order * 104729);
  const questions = activityData.type === "camera"
    ? activityData.targets.map((label, index) => buildCameraQuestion(label, signsBySlug, index, { prompt: activityData.prompt, note: activityData.note }))
    : activityData.signs.map((slug, index) =>
        buildSignChoiceQuestion(findSign(slug), allSigns, random, index, {
          prompt: activityData.prompt,
          tip: activityData.tips?.[slug],
          note: activityData.note,
          activityPool,
        }),
      );

  await ActivityModel.findOneAndUpdate(
    { module: module._id, order },
    {
      $setOnInsert: {
        module: module._id,
        order,
        title: activityData.title,
        description: activityData.description ?? "",
        questionsPerAttempt: activityData.questionsPerAttempt ?? null,
        questions,
      },
    },
    { upsert: true, runValidators: true },
  );
}

/**
 * Cria módulos e atividades de data/trail.json que ainda não existem; cada módulo novo exige o anterior.
 * @returns {Promise<number>} quantidade de módulos.
 */
async function upsertTrail(signsBySlug) {
  const modules = await readSeedFile("trail.json");
  let previousModule = null;

  for (const [moduleIndex, moduleData] of modules.entries()) {
    const module = await ModuleModel.findOneAndUpdate(
      { slug: moduleData.slug },
      {
        $setOnInsert: {
          slug: moduleData.slug,
          title: moduleData.title,
          description: moduleData.description ?? "",
          icon: moduleData.icon,
          level: moduleData.level,
          order: moduleIndex + 1,
          prerequisite: previousModule?._id ?? null,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    for (const [activityIndex, activityData] of moduleData.activities.entries()) {
      await upsertActivity(module, activityData, activityIndex + 1, signsBySlug);
    }
    previousModule = module;
  }
  return modules.length;
}

/**
 * Cria as conquistas padrão que ainda não existem (pela key). $setOnInsert: rodar o seed de novo
 * NÃO desfaz o que o painel alterou (título, meta, desativação...).
 * @returns {Promise<number>} quantidade de conquistas padrão.
 */
async function insertMissingAchievements() {
  await AchievementModel.bulkWrite(
    DEFAULT_ACHIEVEMENTS.map(({ id, ...achievement }, index) => ({
      updateOne: {
        filter: { key: id },
        update: { $setOnInsert: { key: id, icon: "medal", active: true, order: index + 1, ...achievement } },
        upsert: true,
      },
    })),
  );
  return DEFAULT_ACHIEVEMENTS.length;
}

/**
 * Cria os níveis padrão que ainda não existem (pelo número). Também não sobrescreve edições do painel.
 * @returns {Promise<number>} quantidade de níveis padrão.
 */
async function insertMissingLevels() {
  await LevelModel.bulkWrite(
    DEFAULT_LEVELS.map((level) => ({
      updateOne: { filter: { level: level.level }, update: { $setOnInsert: level }, upsert: true },
    })),
  );
  return DEFAULT_LEVELS.length;
}

/**
 * Cria o conteúdo inicial que estiver faltando (pode rodar várias vezes; não cria usuários).
 * Nada que já existe é sobrescrito: depois do primeiro seed, o conteúdo é editado pelo painel.
 * No fim, sobe a versão do conteúdo (o backend descarta o cache).
 * @returns {Promise<{signs: number, modules: number, achievements: number, levels: number, contentVersion: number}>}
 * Usado por: `npm run seed` e tests/helpers.js.
 */
export async function seedContent() {
  const signsBySlug = await upsertSigns();
  await splitAlphabetActivity(); // antes do upsertTrail: as atividades são identificadas pela ordem no módulo
  const moduleCount = await upsertTrail(signsBySlug);
  const achievements = await insertMissingAchievements();
  const levels = await insertMissingLevels();
  clearAchievementsCache();
  clearLevelsCache();
  clearSettingsCache();
  clearEventsCache();
  const contentVersion = await bumpContentVersion();
  return { signs: signsBySlug.size, modules: moduleCount, achievements, levels, contentVersion };
}

/**
 * Execução via `npm run seed`: conecta, popula e desconecta.
 */
async function runFromCommandLine() {
  const { getEnvironment } = await import("../config/env.js");
  const { connectDatabase, disconnectDatabase } = await import("../database/database.js");
  await connectDatabase(getEnvironment().databaseUrl);
  const summary = await seedContent();
  console.log(
    `Seed concluído: ${summary.signs} sinais, ${summary.modules} módulos, ${summary.achievements} conquistas, ` +
      `${summary.levels} níveis (versão do conteúdo: ${summary.contentVersion}).`,
  );
  await disconnectDatabase();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runFromCommandLine().catch((error) => {
    console.error("Falha no seed:", error.message);
    process.exit(1);
  });
}
