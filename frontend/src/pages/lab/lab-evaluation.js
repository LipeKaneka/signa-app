// Experimento VLibras × câmera: mede se o que o app usa para reconhecer gestos pela câmera "entende" o avatar
// do VLibras, e se o avatar serve de referência para conferir gestos de pessoas. Tudo com os mesmos modelos
// e a mesma normalização da câmera (useHandCamera / useSignTranslator).
import {
  LIMIAR_DESCONHECIDO,
  amostrasBase,
  caracteristicas,
  classificar,
  pontosNormalizados,
} from "../../features/translator/engine/classificador.js";
import { Extrator, classificarSinal } from "../../features/translator/engine/dinamicos.js";

const toPoint = ([x, y, z]) => ({ x, y, z });
// Pontos da pose que o modelo não usa chegam como null (o extrator só guarda os usados).
const toPosePoint = (point) => (point ? { x: point[0], y: point[1], z: point[2], visibility: point[3] } : null);

/** A mão que o app usaria no quadro: a de maior confiança (como em engine/maos.js). */
function pickHand(frame) {
  if (!frame.maos.length) return null;
  return frame.maos.reduce((best, hand) => ((hand.score ?? 0) > (best.score ?? 0) ? hand : best));
}

/** Vetor de características de um quadro do avatar (igual ao quadro da câmera) ou null sem mão. */
export function letterVector(frame, aspect) {
  const hand = pickHand(frame);
  if (!hand) return null;
  return caracteristicas(pontosNormalizados(hand.p.map(toPoint), hand.lado ?? "Right", aspect));
}

/** Contagem → rótulo mais frequente. */
function mostFrequent(labels) {
  const count = {};
  labels.forEach((label) => { count[label] = (count[label] ?? 0) + 1; });
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * Letra do avatar → classificador de letras do app (treinado com fotos de pessoas), nos quadros com a mão parada.
 * @returns {{glosa, quadros, comMao, deteccao, aceitos, acertosPorQuadro, previsto, acertou, top}}
 */
export function evaluateLetter(glosa, record, samples = amostrasBase()) {
  const aspect = record.largura / record.altura;
  const vectors = record.quadros.map((frame) => letterVector(frame, aspect)).filter(Boolean);
  // Metade do meio dos quadros com mão (a mão parada na letra; o começo e o fim são ela subindo e descendo).
  const quarter = Math.floor(vectors.length / 4);
  const results = vectors.slice(quarter, vectors.length - quarter).map((vector) => classificar(vector, samples, 5, LIMIAR_DESCONHECIDO));
  const known = samples.some((sample) => sample.rotulo === glosa);
  const accepted = results.filter((result) => result.rotulo);
  const previsto = mostFrequent(accepted.map((result) => result.rotulo)) ?? mostFrequent(results.map((r) => r.maisParecido));
  return {
    glosa,
    quadros: record.quadros.length,
    comMao: vectors.length,
    deteccao: record.quadros.length ? vectors.length / record.quadros.length : 0,
    aceitos: results.length ? accepted.length / results.length : 0,
    acertosPorQuadro: results.length ? results.filter((result) => result.rotulo === glosa).length / results.length : 0,
    previsto,
    // null = o classificador do app não tem fotos de pessoas desta letra (não dá para comparar).
    acertou: known ? previsto === glosa : null,
  };
}

/**
 * Sinal com movimento do avatar → modelo de sinais dinâmicos do app (LSTM treinado com pessoas, MINDS-Libras).
 * @returns {{glosa, palavra, quadros, comMao, previsto, confianca, reconhecido, acertou, top}}
 */
export function evaluateWord(glosa, palavra, record, model) {
  const extractor = new Extrator();
  const frames = record.quadros.map((frame) => ({
    ...extractor.quadro(frame.pose?.map(toPosePoint) ?? null, frame.maos.map((hand) => hand.p.map(toPoint)), record.largura, record.altura),
    t: frame.t / 1000,
  }));
  const withHand = frames.filter((frame) => frame.comMao);
  const valid = frames.filter((frame) => frame.valido);
  if (valid.length < 3) return { glosa, palavra, quadros: frames.length, comMao: withHand.length, previsto: null, confianca: 0, reconhecido: false, acertou: false, top: [] };
  // Recorte como o da câmera: do primeiro ao último quadro com mão (mais 2 de folga em cada lado).
  const first = Math.max(frames.findIndex((frame) => frame.comMao) - 2, 0);
  const last = Math.min(frames.length - 1 - [...frames].reverse().findIndex((frame) => frame.comMao) + 2, frames.length - 1);
  const segment = frames.slice(first, last + 1).filter((frame) => frame.valido);
  const result = classificarSinal(model, { Xs: segment.map((frame) => frame.X), ts: segment.map((frame) => frame.t) });
  return {
    glosa,
    palavra,
    quadros: frames.length,
    comMao: withHand.length,
    previsto: result.maisParecido,
    confianca: result.confianca,
    reconhecido: Boolean(result.palavra),
    acertou: result.maisParecido === palavra,
    top: result.top,
  };
}

/**
 * Caminho inverso: usa SÓ o avatar como referência (k-NN com os quadros dele) para reconhecer as fotos de
 * pessoas que o app já tem (amostras-base). Simula conferir pela câmera o gesto de alguém contra o avatar.
 * @returns {{total, acertos, taxa, porLetra: Record<string, {total, acertos}>}}
 */
export function evaluateAvatarAsReference(letterRecords) {
  const avatarSamples = [];
  for (const [glosa, record] of Object.entries(letterRecords)) {
    const aspect = record.largura / record.altura;
    // Só a metade do meio dos quadros com mão: o começo e o fim são a mão subindo e descendo, não a letra.
    const vectors = record.quadros.map((frame) => letterVector(frame, aspect)).filter(Boolean);
    const quarter = Math.floor(vectors.length / 4);
    vectors.slice(quarter, vectors.length - quarter).forEach((v) => avatarSamples.push({ rotulo: glosa, v, origem: "base" }));
  }
  const letters = new Set(Object.keys(letterRecords));
  const people = amostrasBase().filter((sample) => letters.has(sample.rotulo));
  const porLetra = {};
  let acertos = 0;
  for (const sample of people) {
    const { maisParecido } = classificar(sample.v, avatarSamples, 5, Infinity);
    const hit = maisParecido === sample.rotulo;
    porLetra[sample.rotulo] ??= { total: 0, acertos: 0 };
    porLetra[sample.rotulo].total += 1;
    if (hit) { porLetra[sample.rotulo].acertos += 1; acertos += 1; }
  }
  return { total: people.length, acertos, taxa: people.length ? acertos / people.length : 0, porLetra, amostrasAvatar: avatarSamples.length };
}
