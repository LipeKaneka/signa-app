import { AchievementMedal } from "./illustrations.jsx";
import "./achievement-card.css";

/** Raridade (appearance.tier) → texto do selo. */
export const TIER_LABELS = { common: "Comum", rare: "Rara", epic: "Épica", legendary: "Lendária" };

/** "Obtida em 11/09/2026 às 22:00". */
function formatUnlockDate(isoDate) {
  const date = new Date(isoDate);
  const day = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `Obtida em ${day} às ${time}`;
}

/**
 * Cores da conquista como variáveis CSS (--ach-from, --ach-to, --ach-accent), usadas pela medalha, borda e brilho.
 * Sem aparência (secreta bloqueada, servidor antigo): undefined = cores padrão do CSS.
 */
export function achievementStyle(appearance) {
  if (!appearance) return undefined;
  return { "--ach-from": appearance.colorFrom, "--ach-to": appearance.colorTo, "--ach-accent": appearance.accentColor };
}

/**
 * Medalha da conquista: imagem do painel > emoji > medalha padrão, no fundo com as cores escolhidas.
 * Com efeito "brilhos", desenha as estrelinhas em volta.
 * @param {{appearance?: object|null, size?: number, hidden?: boolean}} props - hidden = secreta bloqueada ("?").
 * Usado por: AchievementCard e AchievementToast.
 */
export function AchievementBadge({ appearance, size = 52, hidden = false }) {
  const inner = Math.round(size * 0.77);
  let content;
  if (hidden) content = <span className="achievement-badge__secret" aria-hidden="true">?</span>;
  else if (appearance?.image) content = <img className="achievement-badge__image" src={appearance.image} alt="" />;
  else if (appearance?.emoji) content = <span className="achievement-badge__emoji" style={{ fontSize: inner * 0.72 }} aria-hidden="true">{appearance.emoji}</span>;
  else content = <AchievementMedal size={inner} />;
  return (
    <span className="achievement-badge" style={{ width: size, height: size, ...achievementStyle(appearance) }}>
      {content}
      {appearance?.effect === "sparkles" && (
        <span className="achievement-badge__sparkles" aria-hidden="true">
          <i /><i /><i />
        </span>
      )}
    </span>
  );
}

/**
 * Cartão de conquista: medalha, título e descrição, com a aparência do painel (cores, raridade, efeito).
 * Bloqueada fica apagada e sem efeito. showDate = mostra "Obtida em …" embaixo do cartão.
 * Usado por: ProfilePage e AchievementsPage.
 */
export function AchievementCard({ achievement, showDate = false }) {
  const unlocked = achievement.unlocked;
  // Secreta e ainda bloqueada: o servidor já manda sem título, descrição, progresso e aparência.
  const hiddenSecret = achievement.secret && !unlocked;
  const appearance = hiddenSecret ? null : achievement.appearance;
  const effect = unlocked && appearance?.effect && appearance.effect !== "none" ? appearance.effect : null;
  const tier = appearance?.tier ? TIER_LABELS[appearance.tier] : null;
  const classes = [
    "achievement-card",
    unlocked ? "" : "achievement-card--locked",
    hiddenSecret ? "achievement-card--secret" : "",
    appearance ? "achievement-card--custom" : "",
    effect ? `achievement-card--fx-${effect}` : "",
    appearance?.tier ? `achievement-card--tier-${appearance.tier}` : "",
  ].filter(Boolean).join(" ");
  return (
    <li className="achievement-item">
      <div className={classes} style={achievementStyle(appearance)}>
        <span className="achievement-card__medal"><AchievementBadge appearance={appearance} hidden={hiddenSecret} /></span>
        <div className="achievement-card__body">
          {tier && <span className={`achievement-tier achievement-tier--${appearance.tier}`}>{tier}</span>}
          <h3 className="achievement-card__title">{achievement.title}</h3>
          <p className="achievement-card__description">{achievement.description}</p>
          <span className="visually-hidden">
            {unlocked ? "Conquistada." : hiddenSecret ? "Conquista secreta, ainda bloqueada." : `Ainda não conquistada: ${achievement.current} de ${achievement.goal}.`}
          </span>
        </div>
      </div>
      {showDate && unlocked && achievement.unlockedAt && (
        <p className="achievement-item__date">{formatUnlockDate(achievement.unlockedAt)}</p>
      )}
    </li>
  );
}

/**
 * Conquistas desbloqueadas da mais recente para a mais antiga (sem data vão para o fim).
 * @param {object[]} achievements - de GET /profile.
 * @returns {object[]}
 */
export function sortByUnlockDate(achievements) {
  return achievements
    .filter((achievement) => achievement.unlocked)
    .sort((a, b) => new Date(b.unlockedAt ?? 0) - new Date(a.unlockedAt ?? 0));
}
