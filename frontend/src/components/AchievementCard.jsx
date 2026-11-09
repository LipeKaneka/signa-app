import { AchievementMedal } from "./illustrations.jsx";
import "./achievement-card.css";

/** "Obtida em 11/09/2026 às 22:00". */
function formatUnlockDate(isoDate) {
  const date = new Date(isoDate);
  const day = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `Obtida em ${day} às ${time}`;
}

/**
 * Cartão de conquista: medalha, título e descrição. Bloqueada fica mais clara.
 * showDate = mostra "Obtida em …" embaixo do cartão (tela Conquistas e conquistas recentes do perfil).
 * Usado por: ProfilePage e AchievementsPage.
 */
export function AchievementCard({ achievement, showDate = false }) {
  const unlocked = achievement.unlocked;
  // Secreta e ainda bloqueada: o servidor já manda sem título, descrição e progresso.
  const hiddenSecret = achievement.secret && !unlocked;
  return (
    <li className="achievement-item">
      <div className={`achievement-card${unlocked ? "" : " achievement-card--locked"}${hiddenSecret ? " achievement-card--secret" : ""}`}>
        <span className="achievement-card__medal">{hiddenSecret ? <span className="achievement-card__secret" aria-hidden="true">?</span> : <AchievementMedal size={40} />}</span>
        <div>
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
