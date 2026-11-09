import { useRef, useState } from "react";
import { fileToAvatarImages } from "../../utils/avatar-image.js";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import * as UserApi from "../../api/api-user.js";
import { useAsyncData } from "../../hooks/useAsyncData.js";
import { ErrorState, LoadingState, ScreenWithNav } from "../../components/layout.jsx";
import { Icon } from "../../components/Icon.jsx";
import { AwardIllustration, BookIllustration, Flame, GearsIllustration, LogoHand, XpIcon } from "../../components/illustrations.jsx";
import { AchievementCard, sortByUnlockDate } from "../../components/AchievementCard.jsx";
import "./profile.css";
import { formatCompact, formatFull } from "../../utils/format-number.js";

/** Quantas conquistas recentes aparecem no perfil (as outras ficam na tela Conquistas). */
const RECENT_ACHIEVEMENTS = 3;

function readInitials(nickname) {
  const words = nickname.trim().split(/\s+/);
  return (words[0][0] + (words.length > 1 ? words.at(-1)[0] : "")).toUpperCase();
}

function EditProfileForm({ user, onSaved, onCancel }) {
  const [nickname, setNickname] = useState(user.nickname);
  const [city, setCity] = useState(user.city);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await UserApi.updateProfile({ nickname: nickname.trim(), city: city.trim() });
      onSaved(response.user);
    } catch (saveError) {
      setError(saveError.message);
      setSaving(false);
    }
  }

  return (
    <form className="profile-edit" onSubmit={handleSubmit}>
      <label className="field">
        <Icon name="person" size={18} />
        <span className="visually-hidden">Nome</span>
        <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Nome" maxLength={60} required />
      </label>
      <label className="field">
        <Icon name="location" size={18} />
        <span className="visually-hidden">Cidade</span>
        <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Cidade" maxLength={60} />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="profile-edit__actions">
        <button type="button" className="button-link" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="button-primary" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</button>
      </div>
    </form>
  );
}

/**
 * Foto de perfil (ou as iniciais). Tocar abre a galeria/câmera do aparelho; vão para o servidor só a foto 256×256
 * e a miniatura 64×64 (usada no ranking). Com foto, aparece também "Remover foto".
 */
function ProfileAvatar({ user, onSaved }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function saveAvatar(images) {
    setBusy(true);
    setError("");
    try {
      const response = await UserApi.updateProfile(images);
      onSaved(response.user);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = ""; // permite escolher a mesma foto de novo
    if (!file) return;
    try {
      await saveAvatar(await fileToAvatarImages(file));
    } catch (fileError) {
      setError(fileError.message);
    }
  }

  return (
    <div className="profile-avatar">
      <button
        type="button"
        className={`profile-identity__avatar${busy ? " profile-identity__avatar--busy" : ""}`}
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={user.avatar ? "Trocar a foto de perfil" : "Colocar uma foto de perfil"}
      >
        {user.avatar ? <img src={user.avatar} alt="" /> : <span aria-hidden="true">{readInitials(user.nickname)}</span>}
        <span className="profile-avatar__badge" aria-hidden="true"><Icon name="camera" size={14} strokeWidth={2} /></span>
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="visually-hidden" tabIndex={-1} onChange={handleFile} />
      {user.avatar && !busy && (
        <button type="button" className="profile-avatar__remove" onClick={() => saveAvatar({ avatar: "", avatarThumb: "" })}>Remover foto</button>
      )}
      {error && <p className="form-error profile-avatar__error" role="alert">{error}</p>}
    </div>
  );
}

function ProfileIdentity({ user, onEdit, onSaved }) {
  return (
    <div className="profile-identity">
      <ProfileAvatar user={user} onSaved={onSaved} />
      <div>
        <h2 className="profile-identity__name">
          {user.nickname}
          <button type="button" className="icon-button profile-identity__edit" onClick={onEdit} aria-label="Editar perfil">
            <Icon name="pencil" size={20} strokeWidth={1.6} />
          </button>
        </h2>
        {user.city && (
          <p className="profile-identity__city">
            <Icon name="location" size={16} strokeWidth={1.8} /> {user.city}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Nível atual (calculado pelo XP no servidor; a tabela é editada no painel) e quanto falta para o próximo.
 * @param {{level: {level: number, title: string, minXp: number, nextLevelXp: number|null}, xp: number}} props
 */
function LevelCard({ level, xp }) {
  const isLast = level.nextLevelXp === null;
  const span = isLast ? 1 : level.nextLevelXp - level.minXp;
  const progress = isLast ? 1 : Math.min(Math.max((xp - level.minXp) / span, 0), 1);
  const missing = isLast ? 0 : level.nextLevelXp - xp;
  return (
    <section className="level-card" aria-label={`Nível ${level.level}: ${level.title}`}>
      <div className="level-card__badge" aria-hidden="true">{level.level}</div>
      <div className="level-card__body">
        <p className="level-card__title"><span>Nível {level.level}</span> {level.title}</p>
        <div
          className="level-card__track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          aria-label="Progresso até o próximo nível"
        >
          <div className="level-card__fill" style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="level-card__hint">{isLast ? "Nível máximo alcançado!" : `Faltam ${formatCompact(missing)} XP para o nível ${level.level + 1}`}</p>
      </div>
    </section>
  );
}

const SHORTCUTS = [
  { to: "/dicionario", label: "Dicionário", ariaLabel: "Dicionário", illustration: <BookIllustration size={46} /> },
  { to: "/conquistas", label: "Conquistas", ariaLabel: "Conquistas", illustration: <AwardIllustration size={44} /> },
  { to: "/configuracoes", label: "Config.", ariaLabel: "Configurações", illustration: <GearsIllustration size={46} /> },
];

/**
 * Perfil: identidade, ofensiva, XP, nível, atalhos e as conquistas desbloqueadas mais recentes (GET /profile). As conquistas vêm prontas do
 * backend, então conquistas novas aparecem sem mudar o app.
 */
export function ProfilePage() {
  const { setUser } = useAuth();
  const { data, error, loading, reload, setData } = useAsyncData(UserApi.fetchProfile);
  const [editing, setEditing] = useState(false);
  // No perfil, só as conquistas desbloqueadas mais recentes; a lista completa fica na tela Conquistas.
  const recentAchievements = data ? sortByUnlockDate(data.achievements).slice(0, RECENT_ACHIEVEMENTS) : [];

  function handleSaved(updatedUser) {
    setUser(updatedUser);
    setData((current) => ({ ...current, user: updatedUser }));
    setEditing(false);
  }

  function handleAvatarSaved(updatedUser) {
    setUser(updatedUser);
    setData((current) => ({ ...current, user: updatedUser }));
  }

  return (
    <ScreenWithNav
      title={<>Signa <LogoHand size={34} color="#fff" /></>}
      backTo={-1}
      headerRounded
      headerClassName="top-bar--brand-center"
      contentClassName="profile-content"
    >
      {loading && <LoadingState />}
      {error && <ErrorState message={error.message} onRetry={reload} />}
      {data && (
        <>
          {editing ? (
            <EditProfileForm user={data.user} onSaved={handleSaved} onCancel={() => setEditing(false)} />
          ) : (
            <ProfileIdentity user={data.user} onEdit={() => setEditing(true)} onSaved={handleAvatarSaved} />
          )}

          <div className="profile-stats">
            <div className="stat-card">
              <strong title={formatFull(data.user.streak)}><Flame size={42} /> {formatCompact(data.user.streak)}</strong>
              <span>Dias consecutivos</span>
            </div>
            <div className="stat-card">
              <strong title={formatFull(data.user.xp)}><XpIcon size={84} /> {formatCompact(data.user.xp)}</strong>
              <span>Pontos de XP Totais</span>
            </div>
          </div>

          {data.user.level && <LevelCard level={data.user.level} xp={data.user.xp} />}

          <nav className="profile-shortcuts" aria-label="Atalhos">
            {SHORTCUTS.map((shortcut) => (
              <Link key={shortcut.to} to={shortcut.to} className="profile-shortcut" aria-label={shortcut.ariaLabel}>
                {shortcut.illustration}
                <span>{shortcut.label}</span>
              </Link>
            ))}
          </nav>

          <div className="profile-section-header">
            <h2 className="profile-section-title">Conquistas</h2>
            <Link to="/conquistas" className="profile-section-link">Ver todas</Link>
          </div>
          {recentAchievements.length > 0 ? (
            <ul className="achievement-list achievement-list--recent">
              {recentAchievements.map((achievement) => (
                <AchievementCard key={achievement.id} achievement={achievement} showDate />
              ))}
            </ul>
          ) : (
            <p className="achievement-empty">Nenhuma conquista ainda. Conclua atividades na trilha para ganhar a primeira!</p>
          )}
        </>
      )}
    </ScreenWithNav>
  );
}
