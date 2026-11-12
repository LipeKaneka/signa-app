/**
 * Aparência de cada conquista no app (escolhida no painel): diferencia uma conquista da outra.
 * - tier: raridade mostrada no cartão ("" = sem selo). O painel usa como atalho para preencher cores e efeito.
 * - colorFrom/colorTo: fundo da medalha (degradê; iguais = cor sólida). accentColor: borda e brilho do cartão.
 * - image: data URL (PNG, JPEG ou WebP, nunca SVG) de até 128×128 no lugar da medalha; emoji: alternativa sem imagem.
 *   Prioridade: image > emoji > medalha padrão.
 * - effect: animação quando desbloqueada (bloqueada fica parada e apagada).
 * Usado por: model-achievement.js, painel (controller-admin-gamification) e service-achievement (envio ao app).
 */
export const ACHIEVEMENT_TIERS = Object.freeze(["", "common", "rare", "epic", "legendary"]);
export const ACHIEVEMENT_EFFECTS = Object.freeze(["none", "shine", "glow", "sparkles", "rainbow", "float"]);

export const DEFAULT_ACHIEVEMENT_APPEARANCE = Object.freeze({
  tier: "",
  colorFrom: "#4f31bb",
  colorTo: "#4f31bb",
  accentColor: "#4f31bb",
  emoji: "",
  image: "",
  effect: "none",
});

/** Imagem já reduzida pelo painel (128×128): fica leve porque vai junto com o perfil para o app. */
export const ACHIEVEMENT_IMAGE_MAX_LENGTH = 40000;
const IMAGE_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const COLOR_FIELDS = ["colorFrom", "colorTo", "accentColor"];

/**
 * Lê a aparência enviada pelo painel (campos ausentes ficam com o valor de base).
 * @param {unknown} value
 * @param {object} [base] - aparência atual (ao editar) ou o padrão.
 * @returns {object} aparência completa e válida.
 * @throws {Error} com mensagem para o painel (o controller transforma em 400).
 */
export function readAchievementAppearance(value, base = DEFAULT_ACHIEVEMENT_APPEARANCE) {
  const result = { ...DEFAULT_ACHIEVEMENT_APPEARANCE, ...(base ?? {}) };
  if (value === undefined || value === null) return result;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Aparência inválida.");
  if (value.tier !== undefined) {
    if (!ACHIEVEMENT_TIERS.includes(value.tier)) throw new Error("Raridade inválida.");
    result.tier = value.tier;
  }
  if (value.effect !== undefined) {
    if (!ACHIEVEMENT_EFFECTS.includes(value.effect)) throw new Error("Efeito inválido.");
    result.effect = value.effect;
  }
  for (const field of COLOR_FIELDS) {
    if (value[field] === undefined) continue;
    if (typeof value[field] !== "string" || !HEX_COLOR.test(value[field])) throw new Error(`Cor inválida em "${field}" (use #RRGGBB).`);
    result[field] = value[field].toLowerCase();
  }
  if (value.emoji !== undefined) {
    const emoji = typeof value.emoji === "string" ? value.emoji.trim() : "";
    // Um emoji pode ter vários "caracteres" (pele, ZWJ): limita pelo tamanho do texto, não pela contagem visual.
    if (emoji.length > 8) throw new Error("Emoji: use um só (ou deixe vazio).");
    result.emoji = emoji;
  }
  if (value.image !== undefined) {
    if (value.image === "" || value.image === null) result.image = "";
    else if (typeof value.image !== "string" || !IMAGE_PATTERN.test(value.image)) throw new Error("A imagem precisa ser PNG, JPEG ou WebP.");
    else if (value.image.length > ACHIEVEMENT_IMAGE_MAX_LENGTH) throw new Error("Imagem grande demais: use uma imagem menor (até 128×128).");
    else result.image = value.image;
  }
  return result;
}

/** Aparência pronta para o app (conquistas antigas, sem o campo, ficam com o padrão). */
export function toPublicAchievementAppearance(appearance) {
  const { tier, colorFrom, colorTo, accentColor, emoji, image, effect } = { ...DEFAULT_ACHIEVEMENT_APPEARANCE, ...(appearance ?? {}) };
  return { tier, colorFrom, colorTo, accentColor, emoji, image, effect };
}
