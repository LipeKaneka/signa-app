/**
 * Sufixos dos números grandes, do maior para o menor (os mesmos do painel): mil (K), milhão (M), bilhão (B), trilhão (T),
 * quatrilhão (Qd), quintilhão (Qn), sextilhão (Sx), septilhão (Sp), octilhão (Oc), nonilhão (No) e decilhão (Dc).
 */
const UNITS = [
  [1e33, "Dc"],
  [1e30, "No"],
  [1e27, "Oc"],
  [1e24, "Sp"],
  [1e21, "Sx"],
  [1e18, "Qn"],
  [1e15, "Qd"],
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
];

/**
 * Número curto para a tela: até 999 fica igual; de 1000 em diante vira 1K, 1,5K, 12,3K, 2M, 1,2B, 3T, 4,5Qd...
 * Uma casa decimal (vírgula, como no Brasil), cortada e não arredondada: 1999 vira "1,9K", nunca "2K" (não mostra
 * mais do que a pessoa tem) e 999.999 vira "999,9K" (nunca "1000K"). Zeros no fim somem: 1000 vira "1K".
 * @param {number} value
 * @returns {string}
 * Usado por: cabeçalho da trilha, perfil, nível, ranking e resultado das atividades.
 */
export function formatCompact(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "");
  const sign = number < 0 ? "-" : "";
  const absolute = Math.abs(number);
  for (const [size, suffix] of UNITS) {
    if (absolute >= size) {
      const tenths = Math.floor((absolute * 10) / size);
      return `${sign}${String(tenths / 10).replace(".", ",")}${suffix}`;
    }
  }
  return `${sign}${Number.isInteger(absolute) ? absolute : Math.floor(absolute)}`;
}

/**
 * Número inteiro com separador de milhar (1.234.567): para leitores de tela e dicas (title), onde cabe o valor exato.
 * @param {number} value
 * @returns {string}
 */
export function formatFull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("pt-BR") : String(value ?? "");
}
