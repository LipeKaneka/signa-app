import { api } from "./api.js";

const OPTION_IDS = ["a", "b", "c", "d", "e", "f"];

/**
 * Todos os verbetes ativos do dicionário (busca página por página).
 * @returns {Promise<{slug: string, word: string, category: string, vlibrasGloss: string|null}[]>}
 * Usado por: ExercisesPage e o editor de atividade (gerar perguntas).
 */
export async function loadAllSigns() {
  const signs = [];
  for (let page = 1; page <= 50; page += 1) {
    const data = await api("/signs", { query: { status: "active", page, limit: 100 } });
    signs.push(...data.signs);
    if (page >= data.pages) break;
  }
  return signs;
}

/** Cópia embaralhada (Fisher-Yates). */
function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

/**
 * Monta perguntas "Qual sinal é esse?" a partir de sinais escolhidos: o avatar faz o sinal e as alternativas são
 * a palavra certa + palavras de outros sinais (de preferência da mesma categoria, para ficar mais desafiador).
 * @param {object[]} chosen - sinais que viram perguntas (na ordem).
 * @param {object[]} pool - todos os sinais (de onde saem as alternativas erradas).
 * @param {number} [optionCount=4] - alternativas por pergunta (2 a 6).
 * @returns {object[]} perguntas no formato da API do painel ({type, prompt, signSlug, options, correctOptionId, explanation}).
 * @throws {Error} se não houver sinais suficientes para as alternativas.
 */
export function buildSignQuestions(chosen, pool, optionCount = 4) {
  if (pool.length < optionCount) throw new Error(`O dicionário precisa de pelo menos ${optionCount} sinais ativos.`);
  return chosen.map((sign, index) => {
    const others = pool.filter((other) => other.slug !== sign.slug && other.word !== sign.word);
    const sameCategory = shuffle(others.filter((other) => other.category === sign.category));
    const rest = shuffle(others.filter((other) => other.category !== sign.category));
    const distractors = [...sameCategory, ...rest].slice(0, optionCount - 1);
    const words = shuffle([sign, ...distractors]);
    const options = words.map((word, position) => ({ id: OPTION_IDS[position], text: word.word }));
    return {
      key: `q${index + 1}`,
      type: "sign_choice",
      prompt: "Qual sinal é esse?",
      signSlug: sign.slug,
      options,
      correctOptionId: options[words.indexOf(sign)].id,
      explanation: `Esse é o sinal de "${sign.word}".`,
    };
  });
}
