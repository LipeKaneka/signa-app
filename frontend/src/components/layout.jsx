import { NavLink, useNavigate } from "react-router-dom";
import { Icon } from "./Icon.jsx";
import { RankMedal } from "./illustrations.jsx";

/**
 * Cabeçalho roxo com voltar opcional. subtitle aparece em verde (ex.: "Online").
 * rounded = cantos arredondados também no tema claro; children = conteúdo abaixo do título (ex.: busca).
 */
export function TopBar({ title, subtitle, backTo, icon, rounded = false, className = "", children }) {
  const navigate = useNavigate();
  const goBack = () => (backTo === -1 ? navigate(-1) : navigate(backTo));

  return (
    <header className={["top-bar", rounded && "top-bar--rounded", className].filter(Boolean).join(" ")}>
      <div className="top-bar__row">
        {backTo !== undefined && (
          <button type="button" className="icon-button" onClick={goBack} aria-label="Voltar">
            <Icon name="back" size={26} strokeWidth={2.2} />
          </button>
        )}
        {icon}
        <div>
          <h1 className="top-bar__title">{title}</h1>
          {subtitle && <p className="top-bar__subtitle">{subtitle}</p>}
        </div>
      </div>
      {children}
    </header>
  );
}

const NAV_ITEMS = [
  { to: "/trilha", label: "Trilha", icon: <Icon name="book" size={30} strokeWidth={1.4} /> },
  { to: "/assistente", label: "Assistente", icon: <Icon name="chat" size={30} strokeWidth={1.4} /> },
  { to: "/ranking", label: "Ranking", icon: <RankMedal position={1} size={25} /> },
  { to: "/perfil", label: "Perfil", icon: <Icon name="person" size={30} strokeWidth={1.4} /> },
];

/**
 * Navegação inferior fixa: Trilha, Assistente, Ranking e Perfil.
 */
export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Navegação principal">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `bottom-nav__link${isActive ? " bottom-nav__link--active" : ""}`}
        >
          {item.icon}
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Tela com cabeçalho e navegação inferior (Ranking, Perfil, Dicionário…). */
export function ScreenWithNav({
  title,
  subtitle,
  backTo,
  headerIcon,
  headerRounded,
  headerContent,
  headerClassName,
  children,
  contentClassName = "page-content",
}) {
  return (
    <div className="screen screen--with-nav">
      <TopBar title={title} subtitle={subtitle} backTo={backTo} icon={headerIcon} rounded={headerRounded} className={headerClassName}>
        {headerContent}
      </TopBar>
      <main className={contentClassName}>{children}</main>
      <BottomNav />
    </div>
  );
}

/**
 * Indicador de carregamento dentro de uma tela.
 */
export function LoadingState({ message = "Carregando…" }) {
  return (
    <div className="state-message" role="status">
      <div className="spinner" aria-hidden="true" />
      {message}
    </div>
  );
}

/**
 * Mensagem de erro com "Tentar de novo" opcional.
 */
export function ErrorState({ message, onRetry }) {
  return (
    <div className="state-message" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="button-primary" style={{ maxWidth: 220 }} onClick={onRetry}>
          Tentar de novo
        </button>
      )}
    </div>
  );
}

/**
 * Interruptor acessível (role="switch"), usado nas Configurações.
 */
export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      className="toggle"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  );
}
