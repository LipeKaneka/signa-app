/**
 * Aparência da faixa de evento no app (escolhida no painel ao criar/editar o evento).
 * - style: "gradient" (degradê de colorFrom para colorTo), "solid" (só colorFrom) ou "outline" (fundo claro com
 *   borda e destaque em colorFrom).
 * - textColor: cor do texto; accentColor: fundo do selo "2x"; accentTextColor: texto do selo.
 * - icon: emoji opcional antes do título (ex.: 🔥); vazio = sem ícone.
 * Padrão: o roxo da marca (o dourado antigo não combinava com as cores do app).
 */
export const EVENT_STYLES = Object.freeze(["gradient", "solid", "outline"]);

export const DEFAULT_EVENT_APPEARANCE = Object.freeze({
  style: "gradient",
  colorFrom: "#5233c4",
  colorTo: "#8b6cf0",
  textColor: "#ffffff",
  accentColor: "#ffffff",
  accentTextColor: "#3f2c88",
  icon: "",
});

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const COLOR_FIELDS = ["colorFrom", "colorTo", "textColor", "accentColor", "accentTextColor"];

/**
 * Lê a aparência enviada pelo painel (campos ausentes ficam com o valor atual ou o padrão).
 * @param {unknown} value
 * @param {object} [base] - aparência atual (ao editar).
 * @returns {object} aparência completa e válida.
 * @throws {Error} com mensagem para o painel (o controller transforma em 400).
 */
export function readEventAppearance(value, base = DEFAULT_EVENT_APPEARANCE) {
  const result = { ...DEFAULT_EVENT_APPEARANCE, ...base };
  if (value === undefined || value === null) return result;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Aparência inválida.");
  if (value.style !== undefined) {
    if (!EVENT_STYLES.includes(value.style)) throw new Error("Estilo da faixa inválido.");
    result.style = value.style;
  }
  for (const field of COLOR_FIELDS) {
    if (value[field] === undefined) continue;
    if (typeof value[field] !== "string" || !HEX_COLOR.test(value[field])) throw new Error(`Cor inválida em "${field}" (use #RRGGBB).`);
    result[field] = value[field].toLowerCase();
  }
  if (value.icon !== undefined) {
    const icon = typeof value.icon === "string" ? value.icon.trim() : "";
    // Um emoji pode ter vários "caracteres" (pele, ZWJ): limita pelo tamanho do texto, não pela contagem visual.
    if (icon.length > 8) throw new Error("Ícone: use um emoji só (ou deixe vazio).");
    result.icon = icon;
  }
  return result;
}

/** Aparência pronta para a API pública (eventos antigos, sem o campo, ficam com o padrão). */
export function toPublicAppearance(appearance) {
  return { ...DEFAULT_EVENT_APPEARANCE, ...(appearance ?? {}) };
}
