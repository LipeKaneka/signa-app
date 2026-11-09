/**
 * Sufixos dos números grandes (escala curta, como no app): mil, milhão, bilhão, trilhão, quatrilhão, quintilhão,
 * sextilhão, septilhão, octilhão, nonilhão e decilhão.
 */
const UNITS = [
  [1e33, "Dc"], [1e30, "No"], [1e27, "Oc"], [1e24, "Sp"], [1e21, "Sx"], [1e18, "Qn"], [1e15, "Qd"],
  [1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"],
];

/**
 * Número curto: até 999 fica igual; depois 1K, 1,5K, 12,3M, 2B, 4,5Qd... Uma casa decimal cortada (não arredonda
 * para cima: 1999 = "1,9K"); números com casas decimais abaixo de mil mantêm até 2 casas (ex.: 1,5).
 * @param {number} value
 * @returns {string}
 */
export function formatCompact(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "—");
  const sign = number < 0 ? "-" : "";
  const absolute = Math.abs(number);
  for (const [size, suffix] of UNITS) {
    if (absolute >= size) {
      const tenths = Math.floor((absolute / size) * 10) / 10;
      return `${sign}${tenths.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}${suffix}`;
    }
  }
  return `${sign}${absolute.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`;
}

/** Número exato com separador de milhar (1.234.567), para dicas e resumos. */
export function formatFull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : String(value ?? "—");
}

/**
 * Número curto na tela; o valor exato aparece ao passar o mouse (e é o que o leitor de tela lê).
 * @param {{value: number, suffix?: string}} props - suffix: texto depois do número (ex.: " XP", "x").
 */
export function Num({ value, suffix = "" }) {
  const short = formatCompact(value);
  const full = formatFull(value);
  if (short === full) return <>{short}{suffix}</>;
  return <span title={`${full}${suffix}`} aria-label={`${full}${suffix}`}>{short}{suffix}</span>;
}
