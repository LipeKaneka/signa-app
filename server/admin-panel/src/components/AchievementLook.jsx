import { useRef, useState } from "react";

/**
 * Aparência de conquista no painel: editor (raridade, cores, imagem/emoji, efeito) e prévia igual ao cartão do app.
 * Os valores aceitos são os de server/src/config/achievement-appearance.js.
 * Usado por: AchievementsPage (formulário e tabela) e AppProfilePreview ("Ver como no app").
 */
export const DEFAULT_ACHIEVEMENT_APPEARANCE = Object.freeze({
  tier: "",
  colorFrom: "#4f31bb",
  colorTo: "#4f31bb",
  accentColor: "#4f31bb",
  emoji: "",
  image: "",
  effect: "none",
});

export const TIER_LABELS = { common: "Comum", rare: "Rara", epic: "Épica", legendary: "Lendária" };

/** Raridade = atalho: escolher preenche cores e efeito (dá para mudar depois). */
const TIER_PRESETS = {
  "": { colorFrom: "#4f31bb", colorTo: "#4f31bb", accentColor: "#4f31bb", effect: "none" },
  common: { colorFrom: "#8a8798", colorTo: "#6b6880", accentColor: "#8a8798", effect: "none" },
  rare: { colorFrom: "#3b82f6", colorTo: "#1d4ed8", accentColor: "#3b82f6", effect: "shine" },
  epic: { colorFrom: "#8b5cf6", colorTo: "#6b2fd6", accentColor: "#a66cff", effect: "glow" },
  legendary: { colorFrom: "#f5b82e", colorTo: "#e07b00", accentColor: "#f5b82e", effect: "sparkles" },
};

const EFFECTS = [
  ["none", "Nenhum"],
  ["shine", "Reflexo de luz"],
  ["glow", "Brilho pulsando"],
  ["sparkles", "Estrelinhas"],
  ["rainbow", "Borda arco-íris"],
  ["float", "Medalha flutuando"],
];

const COLOR_FIELDS = [
  ["colorFrom", "Medalha (início)"],
  ["colorTo", "Medalha (fim)"],
  ["accentColor", "Borda e brilho"],
];

const IMAGE_SIZE = 128;
const IMAGE_MAX_LENGTH = 40000;

/**
 * Reduz a imagem escolhida para 128×128 (cabe inteira, fundo transparente) e devolve data URL WebP (ou PNG).
 * Abaixa a qualidade até caber no limite do servidor.
 * @param {File} file
 * @returns {Promise<string>}
 */
async function resizeImage(file) {
  // Lê como data URL (o CSP do painel aceita imagens "data:", não "blob:").
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Não foi possível ler esse arquivo."));
    reader.readAsDataURL(file);
  });
  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Não foi possível abrir essa imagem."));
    element.src = source;
  });
  const canvas = document.createElement("canvas");
  canvas.width = IMAGE_SIZE;
  canvas.height = IMAGE_SIZE;
  const scale = Math.min(IMAGE_SIZE / image.width, IMAGE_SIZE / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  canvas.getContext("2d").drawImage(image, (IMAGE_SIZE - width) / 2, (IMAGE_SIZE - height) / 2, width, height);
  for (const quality of [0.9, 0.75, 0.6, 0.45]) {
    const data = canvas.toDataURL("image/webp", quality);
    if (data.startsWith("data:image/webp") && data.length <= IMAGE_MAX_LENGTH) return data;
  }
  const png = canvas.toDataURL("image/png");
  if (png.length <= IMAGE_MAX_LENGTH) return png;
  throw new Error("Imagem detalhada demais: tente outra mais simples.");
}

/** Variáveis de cor usadas pelo CSS (.ach-*). */
function lookStyle(appearance) {
  return { "--ach-from": appearance.colorFrom, "--ach-to": appearance.colorTo, "--ach-accent": appearance.accentColor };
}

/** Medalha: imagem > emoji > 🏅, no fundo com as cores escolhidas. hidden = secreta bloqueada ("?"). */
export function AchievementBadge({ appearance, size = 52, hidden = false }) {
  const look = { ...DEFAULT_ACHIEVEMENT_APPEARANCE, ...(appearance ?? {}) };
  let content;
  if (hidden) content = <span className="ach-badge__secret">?</span>;
  else if (look.image) content = <img className="ach-badge__image" src={look.image} alt="" />;
  else content = <span className="ach-badge__emoji" style={{ fontSize: size * 0.5 }}>{look.emoji || "🏅"}</span>;
  return (
    <span className="ach-badge" style={{ width: size, height: size, ...(hidden ? {} : lookStyle(look)) }} aria-hidden="true">
      {content}
      {!hidden && look.effect === "sparkles" && <span className="ach-badge__sparkles"><i /><i /><i /></span>}
    </span>
  );
}

/** Cartão como no app (desbloqueado: com efeito; bloqueado: apagado). */
export function AchievementPreviewCard({ title, description, appearance, unlocked = true, hidden = false, compact = false }) {
  const look = { ...DEFAULT_ACHIEVEMENT_APPEARANCE, ...(appearance ?? {}) };
  const effect = unlocked && !hidden && look.effect !== "none" ? look.effect : null;
  const classes = [
    "ach-card",
    compact ? "ach-card--compact" : "",
    unlocked ? "" : "ach-card--locked",
    effect ? `ach-card--fx-${effect}` : "",
  ].filter(Boolean).join(" ");
  return (
    <div className={classes} style={hidden ? undefined : lookStyle(look)}>
      <AchievementBadge appearance={look} hidden={hidden} size={compact ? 40 : 52} />
      <div className="ach-card__body">
        {!hidden && look.tier && <span className={`ach-tier ach-tier--${look.tier}`}>{TIER_LABELS[look.tier]}</span>}
        <strong>{title || "Título da conquista"}</strong>
        <span>{description || "Descrição da conquista"}</span>
      </div>
    </div>
  );
}

/**
 * Editor da aparência com prévia (desbloqueada e bloqueada).
 * @param {{value: object, onChange: (changes: object) => void, title: string, description: string}} props
 */
export function AchievementAppearanceEditor({ value, onChange, title, description }) {
  const fileInput = useRef(null);
  const [imageError, setImageError] = useState("");
  const look = { ...DEFAULT_ACHIEVEMENT_APPEARANCE, ...value };

  const chooseImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImageError("");
    try {
      onChange({ image: await resizeImage(file) });
    } catch (error) {
      setImageError(error.message);
    }
  };

  return (
    <fieldset className="appearance-editor">
      <legend>Aparência no app</legend>
      <div className="ach-preview">
        <AchievementPreviewCard title={title} description={description} appearance={look} />
        <AchievementPreviewCard title={title} description={description} appearance={look} unlocked={false} />
        <p className="field__hint">Em cima: desbloqueada (com efeito). Embaixo: bloqueada.</p>
      </div>
      <div className="form__row">
        <label className="field">
          <span className="field__label">Raridade</span>
          <select value={look.tier} onChange={(e) => onChange({ tier: e.target.value, ...TIER_PRESETS[e.target.value] })}>
            <option value="">Sem selo</option>
            {Object.entries(TIER_LABELS).map(([tier, label]) => <option key={tier} value={tier}>{label}</option>)}
          </select>
          <span className="field__hint">Preenche cores e efeito; dá para ajustar depois.</span>
        </label>
        <label className="field">
          <span className="field__label">Efeito (desbloqueada)</span>
          <select value={look.effect} onChange={(e) => onChange({ effect: e.target.value })}>
            {EFFECTS.map(([effect, label]) => <option key={effect} value={effect}>{label}</option>)}
          </select>
        </label>
      </div>
      <div className="color-grid">
        {COLOR_FIELDS.map(([field, label]) => (
          <label key={field} className="color-field">
            <input type="color" value={look[field]} onChange={(e) => onChange({ [field]: e.target.value })} />
            <span>{label}<code>{look[field]}</code></span>
          </label>
        ))}
      </div>
      <div className="form__row">
        <label className="field">
          <span className="field__label">Imagem da medalha</span>
          <span className="ach-image-actions">
            <button type="button" className="button button--ghost" onClick={() => fileInput.current?.click()}>
              {look.image ? "Trocar imagem" : "Escolher imagem"}
            </button>
            {look.image && <button type="button" className="button button--ghost" onClick={() => onChange({ image: "" })}>Remover</button>}
          </span>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={chooseImage} />
          <span className="field__hint">{imageError || "PNG, JPEG ou WebP; é reduzida para 128×128. Fundo transparente fica melhor."}</span>
        </label>
        <label className="field">
          <span className="field__label">Emoji (sem imagem)</span>
          <input value={look.emoji} onChange={(e) => onChange({ emoji: e.target.value })} maxLength={8} placeholder="🏅" />
          <span className="field__hint">Usado se não houver imagem.</span>
        </label>
      </div>
    </fieldset>
  );
}
