import { useState } from "react";
import { Modal } from "./ui.jsx";
import { AchievementPreviewCard } from "./AchievementLook.jsx";
import { formatCompact } from "../format-number.jsx";
import logoBranca from "../assets/brand/logo-branca.svg";
import fogo from "../assets/app/fogo.webp";
import barraXp from "../assets/app/barra-xp-horizontal.webp";

const RECENT_ACHIEVEMENTS = 3;

/** Como o app mostra uma conquista secreta ainda bloqueada (o servidor esconde título, descrição e progresso). */
function asSeenInApp(achievement) {
  if (!achievement.secret || achievement.unlocked) return achievement;
  return { ...achievement, title: "Conquista secreta", description: "Continue praticando para descobrir como desbloquear.", hiddenSecret: true };
}

function formatUnlock(iso) {
  const date = new Date(iso);
  return `Obtida em ${date.toLocaleDateString("pt-BR")} às ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Iniciais do apelido (como o quadrado do app quando a pessoa não tem foto). */
function initials(nickname) {
  return nickname.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0].toUpperCase()).join("");
}

function AchievementItem({ achievement, showDate }) {
  return (
    <li className="phone-achievement">
      {/* Mesmo cartão do app: cores, imagem/emoji, raridade e efeito escolhidos na tela Conquistas. */}
      <AchievementPreviewCard
        title={achievement.title}
        description={achievement.description}
        appearance={achievement.appearance}
        unlocked={achievement.unlocked}
        hidden={achievement.hiddenSecret}
        compact
      />
      {showDate && achievement.unlocked && achievement.unlockedAt && <p className="phone-achievement__date">{formatUnlock(achievement.unlockedAt)}</p>}
    </li>
  );
}

/** Tela "Perfil" do app. */
function ProfileScreen({ user, onAllAchievements }) {
  const level = user.level;
  const isLast = level?.nextLevelXp === null;
  const progress = !level || isLast ? 1 : Math.min(Math.max((user.xp - level.minXp) / (level.nextLevelXp - level.minXp), 0), 1);
  const recent = user.achievements
    .filter((achievement) => achievement.unlocked)
    .sort((a, b) => new Date(b.unlockedAt ?? 0) - new Date(a.unlockedAt ?? 0))
    .slice(0, RECENT_ACHIEVEMENTS);

  return (
    <>
      <div className="phone-identity">
        <span className="phone-avatar">{user.avatar ? <img src={user.avatar} alt="" /> : initials(user.nickname)}</span>
        <div>
          <strong className="phone-identity__name">{user.nickname}</strong>
          {user.city && <span className="phone-identity__city">{user.city}</span>}
        </div>
      </div>

      <div className="phone-stats">
        <div className="phone-stat">
          <strong><img src={fogo} alt="" width={30} height={30} /> {formatCompact(user.streak)}</strong>
          <span>Dias consecutivos</span>
        </div>
        <div className="phone-stat">
          <strong><img src={barraXp} alt="" width={60} /> {formatCompact(user.xp)}</strong>
          <span>Pontos de XP Totais</span>
        </div>
      </div>

      {level && (
        <section className="phone-level">
          <span className="phone-level__badge">{level.level}</span>
          <div className="phone-level__body">
            <p><b>Nível {level.level}</b> {level.title}</p>
            <div className="phone-level__track"><div style={{ width: `${progress * 100}%` }} /></div>
            <small>{isLast ? "Nível máximo alcançado!" : `Faltam ${formatCompact(level.nextLevelXp - user.xp)} XP para o nível ${level.level + 1}`}</small>
          </div>
        </section>
      )}

      <div className="phone-shortcuts" aria-hidden="true">
        <span>📖<b>Dicionário</b></span>
        <span>🏅<b>Conquistas</b></span>
        <span>⚙️<b>Config.</b></span>
      </div>

      <div className="phone-section">
        <h3>Conquistas</h3>
        <button type="button" onClick={onAllAchievements}>Ver todas</button>
      </div>
      {recent.length > 0 ? (
        <ul className="phone-achievements">{recent.map((achievement) => <AchievementItem key={achievement.id} achievement={achievement} showDate />)}</ul>
      ) : (
        <p className="phone-empty">Nenhuma conquista ainda. Conclua atividades na trilha para ganhar a primeira!</p>
      )}
    </>
  );
}

/** Tela "Conquistas" do app (todas, com as secretas escondidas). */
function AchievementsScreen({ user }) {
  const list = [...user.achievements]
    .map(asSeenInApp)
    .sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || new Date(b.unlockedAt ?? 0) - new Date(a.unlockedAt ?? 0));
  return <ul className="phone-achievements">{list.map((achievement) => <AchievementItem key={achievement.id} achievement={achievement} showDate />)}</ul>;
}

/**
 * Prévia do perfil do usuário como ele aparece no aplicativo (perfil e lista de conquistas), num "celular".
 * Usa os dados do detalhe do usuário; conquistas secretas bloqueadas aparecem escondidas, como no app.
 * @param {{user: object, onClose: () => void}} props
 */
export function AppProfilePreview({ user, onClose }) {
  const [screen, setScreen] = useState("profile");
  return (
    <Modal title={`Como ${user.nickname} vê no app`} onClose={onClose}>
      <div className="phone-tabs" role="tablist" aria-label="Tela do app">
        <button type="button" role="tab" aria-selected={screen === "profile"} onClick={() => setScreen("profile")}>Perfil</button>
        <button type="button" role="tab" aria-selected={screen === "achievements"} onClick={() => setScreen("achievements")}>Conquistas</button>
      </div>
      <div className="phone">
        <div className="phone__screen">
          <header className="phone__top">
            {screen === "achievements" && <button type="button" className="phone__back" onClick={() => setScreen("profile")} aria-label="Voltar ao perfil">←</button>}
            <span>{screen === "profile" ? <>Signa <img src={logoBranca} alt="" height={22} /></> : "Conquistas"}</span>
          </header>
          <div className="phone__content">
            {screen === "profile" ? <ProfileScreen user={user} onAllAchievements={() => setScreen("achievements")} /> : <AchievementsScreen user={user} />}
          </div>
          <nav className="phone__nav" aria-hidden="true">
            <span>Trilha</span><span>Assistente</span><span>Ranking</span><span className="phone__nav--on">Perfil</span>
          </nav>
        </div>
      </div>
      <p className="muted small">Prévia com os dados atuais. Alterações não salvas desta tela não aparecem aqui.</p>
    </Modal>
  );
}
