/**
 * Aparência de cada conquista no app (escolhida no painel): diferencia uma conquista da outra.
 * - tier: chave da raridade (coleção achievementtiers, editável no painel; "" = sem selo). O painel usa a
 *   raridade como atalho para preencher cores e efeito.
 * - colorFrom/colorTo: fundo da medalha (degradê; iguais = cor sólida). accentColor: borda e brilho do cartão.
 * - image: data URL (PNG, JPEG ou WebP, nunca SVG) de até 128×128 no lugar da medalha; emoji: alternativa sem imagem.
 *   Prioridade: image > emoji > medalha padrão.
 * - effect: animação quando desbloqueada (bloqueada fica parada e apagada).
 * Usado por: model-achievement.js, painel (controller-admin-gamification) e service-achievement (envio ao app).
 */
/** Chave de raridade: minúsculas, números, _ e - (ex.: "lendaria", "super_rara"). */
export const TIER_KEY_PATTERN = /^[a-z0-9_-]{1,40}$/;

/**
 * Raridades iniciais (criadas no banco na primeira vez que a lista é pedida; depois, o painel edita).
 * Ordem = da mais comum para a mais rara.
 */
export const DEFAULT_ACHIEVEMENT_TIERS = Object.freeze([
  { key: "common", label: "Comum", tagBackground: "#e6e4ee", tagText: "#4e4b5c", preset: { colorFrom: "#8a8798", colorTo: "#6b6880", accentColor: "#8a8798", effect: "none" } },
  { key: "rare", label: "Rara", tagBackground: "#dbeafe", tagText: "#1d4ed8", preset: { colorFrom: "#3b82f6", colorTo: "#1d4ed8", accentColor: "#3b82f6", effect: "shine" } },
  { key: "epic", label: "Épica", tagBackground: "#ede4ff", tagText: "#6b2fd6", preset: { colorFrom: "#8b5cf6", colorTo: "#6b2fd6", accentColor: "#a66cff", effect: "glow" } },
  { key: "legendary", label: "Lendária", tagBackground: "#ffe08a", tagText: "#6b4300", preset: { colorFrom: "#f5b82e", colorTo: "#e07b00", accentColor: "#f5b82e", effect: "sparkles" } },
]);
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
    // A existência da raridade é conferida no serviço (a lista fica no banco).
    if (value.tier !== "" && (typeof value.tier !== "string" || !TIER_KEY_PATTERN.test(value.tier))) throw new Error("Raridade inválida.");
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

/**
 * Lê os campos de uma raridade enviados pelo painel.
 * @param {unknown} body
 * @param {boolean} creating - ao criar, a chave e o nome são obrigatórios (a chave não muda depois).
 * @returns {{key?: string, label?: string, tagBackground?: string, tagText?: string, preset?: object}}
 * @throws {Error} com mensagem para o painel.
 */
export function readTierFields(body, creating) {
  if (!body || typeof body !== "object") throw new Error("Raridade inválida.");
  const fields = {};
  if (creating) {
    if (typeof body.key !== "string" || !TIER_KEY_PATTERN.test(body.key)) throw new Error("Chave da raridade: use letras minúsculas, números, _ ou - (até 40).");
    fields.key = body.key;
  }
  if (body.label !== undefined || creating) {
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!label || label.length > 30) throw new Error("Nome da raridade: de 1 a 30 caracteres.");
    fields.label = label;
  }
  for (const field of ["tagBackground", "tagText"]) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== "string" || !HEX_COLOR.test(body[field])) throw new Error(`Cor inválida em "${field}" (use #RRGGBB).`);
    fields[field] = body[field].toLowerCase();
  }
  if (body.preset !== undefined) {
    const preset = body.preset ?? {};
    if (typeof preset !== "object" || Array.isArray(preset)) throw new Error("Aparência padrão inválida.");
    const result = {};
    for (const field of COLOR_FIELDS) {
      if (preset[field] === undefined) continue;
      if (typeof preset[field] !== "string" || !HEX_COLOR.test(preset[field])) throw new Error(`Cor inválida em "${field}" (use #RRGGBB).`);
      result[field] = preset[field].toLowerCase();
    }
    if (preset.effect !== undefined) {
      if (!ACHIEVEMENT_EFFECTS.includes(preset.effect)) throw new Error("Efeito inválido.");
      result.effect = preset.effect;
    }
    fields.preset = result;
  }
  return fields;
}
