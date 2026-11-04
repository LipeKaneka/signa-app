/**
 * Sinais que o app consegue conferir pela câmera, ou seja, os alvos possíveis das perguntas "camera_sign".
 * Precisa bater com o reconhecedor do app (frontend/src/features/translator):
 * - letras paradas: rótulos de engine/amostras-base.json (as letras com movimento H, J, K, X, Z e Ç ficam de fora,
 *   porque só funcionam depois que a pessoa ensina o gesto);
 * - palavras: public/modelos/sinais-dinamicos.json (modelo treinado com a base MINDS-Libras).
 * Ao trocar o modelo do app, atualize esta lista.
 */
export const CAMERA_LETTERS = Object.freeze(["A", "B", "C", "D", "E", "F", "G", "I", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "Y"]);

export const CAMERA_WORDS = Object.freeze([
  "Acontecer", "Aluno", "Amarelo", "América", "Aproveitar", "Bala", "Banco", "Banheiro", "Barulho", "Cinco",
  "Conhecer", "Espelho", "Esquina", "Filho", "Maçã", "Medo", "Ruim", "Sapo", "Vacina", "Vontade",
]);

/** Todos os alvos, com o tipo (letra parada ou palavra com movimento). Usado pelo painel e pela validação. */
export const CAMERA_TARGETS = Object.freeze([
  ...CAMERA_LETTERS.map((label) => Object.freeze({ label, kind: "letter" })),
  ...CAMERA_WORDS.map((label) => Object.freeze({ label, kind: "word" })),
]);

/** Alternativas fixas de uma pergunta de câmera: o app manda "done" (reconheceu) ou "skip" (pulou). */
export const CAMERA_OPTIONS = Object.freeze([
  Object.freeze({ id: "done", text: "Fiz o sinal" }),
  Object.freeze({ id: "skip", text: "Pular" }),
]);
export const CAMERA_CORRECT_OPTION = "done";
/** Resposta especial: o aparelho não tem câmera ou a permissão foi negada (não conta na nota). */
export const CAMERA_UNAVAILABLE_OPTION = "unavailable";

/**
 * Alvo de câmera pelo rótulo (sem diferenciar maiúsculas).
 * @param {unknown} label
 * @returns {{label: string, kind: "letter"|"word"}|null}
 */
export function findCameraTarget(label) {
  if (typeof label !== "string") return null;
  const wanted = label.trim().toLocaleLowerCase("pt-BR");
  return CAMERA_TARGETS.find((target) => target.label.toLocaleLowerCase("pt-BR") === wanted) ?? null;
}
