import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { PanelIcon } from "./icons.jsx";
import logoBranca from "../assets/brand/logo-branca.svg";
import tipografiaBranca from "../assets/brand/tipografia-branca.svg";

const ROLE_LABELS = { owner: "Dono", admin: "Administrador", editor: "Editor", viewer: "Leitura" };

/** Menu em grupos; cada item mostra só para quem tem a permissão. */
const MENU_GROUPS = [
  { title: "Visão geral", items: [{ to: "/", label: "Dashboard", icon: "home", permission: "read", end: true }] },
  {
    title: "Conteúdo",
    items: [
      { to: "/trilha", label: "Trilha", icon: "trail", permission: "read" },
      { to: "/exercicios", label: "Exercícios", icon: "exercises", permission: "read" },
      { to: "/dicionario", label: "Dicionário", icon: "dictionary", permission: "read" },
    ],
  },
  {
    title: "Gamificação",
    items: [
      { to: "/conquistas", label: "Conquistas", icon: "achievements", permission: "read" },
      { to: "/eventos", label: "Eventos de XP", icon: "events", permission: "read" },
      { to: "/niveis", label: "Níveis", icon: "levels", permission: "read" },
    ],
  },
  {
    title: "Pessoas",
    items: [
      { to: "/usuarios", label: "Usuários", icon: "users", permission: "read" },
      { to: "/notificacoes", label: "Notificações", icon: "bell", permission: "read" },
    ],
  },
  {
    title: "Sistema",
    items: [
      { to: "/configuracoes", label: "Configurações", icon: "settings", permission: "read" },
      { to: "/auditoria", label: "Auditoria", icon: "audit", permission: "manage" },
      { to: "/banco", label: "Banco de dados", icon: "database", permission: "manage" },
      { to: "/administradores", label: "Administradores", icon: "admins", permission: "admins" },
    ],
  },
];
const ALL_ITEMS = MENU_GROUPS.flatMap((group) => group.items);
const COLLAPSED_KEY = "signa-admin:sidebar-collapsed";

/** Título da página atual (barra superior), pelo item de menu que casa com a rota. */
function findPageTitle(pathname) {
  if (pathname === "/conta") return "Minha conta";
  const match = ALL_ITEMS.filter((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to))).sort((a, b) => b.to.length - a.to.length)[0];
  if (match) return match.label;
  if (pathname.startsWith("/atividades")) return "Exercícios";
  return "Painel";
}

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Menu da conta (canto superior direito): nome, papel, Minha conta e Sair. */
function AccountMenu({ admin, logout }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.type === "keydown" ? event.key === "Escape" : !menuRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const initials = admin.name.split(/\s+/).map((word) => word[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="account-menu" ref={menuRef}>
      <button type="button" className="account-menu__button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="menu">
        <span className="avatar" aria-hidden="true">{initials}</span>
        <span className="account-menu__who">
          <strong>{admin.name}</strong>
          <small>{ROLE_LABELS[admin.role]}</small>
        </span>
      </button>
      {open && (
        <div className="account-menu__panel" role="menu">
          <p className="account-menu__email">{admin.email}</p>
          <NavLink to="/conta" role="menuitem" className="account-menu__item" onClick={() => setOpen(false)}>
            <PanelIcon name="account" size={18} /> Minha conta
          </NavLink>
          <button type="button" role="menuitem" className="account-menu__item" onClick={logout}>
            <PanelIcon name="logout" size={18} /> Sair
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Estrutura das páginas logadas: menu lateral em grupos (recolhe para só ícones no computador; vira gaveta no
 * celular), barra superior com o título da página e o menu da conta, e o conteúdo.
 */
export function Layout() {
  const { admin, can, logout } = useAuth();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Trocar de página fecha a gaveta do celular.
  useEffect(() => setDrawerOpen(false), [pathname]);

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, value ? "0" : "1");
      } catch {
        // preferência só nesta visita
      }
      return !value;
    });
  };

  return (
    <div className={`layout${collapsed ? " layout--collapsed" : ""}${drawerOpen ? " layout--drawer-open" : ""}`}>
      <aside className="sidebar" aria-label="Menu do painel">
        <div className="sidebar__brand">
          <img src={logoBranca} alt="" className="sidebar__hand" />
          <div className="sidebar__brand-text">
            <img src={tipografiaBranca} alt="Signa Ludus" className="sidebar__name" />
            <span>Painel administrativo</span>
          </div>
          <button type="button" className="sidebar__close" onClick={() => setDrawerOpen(false)} aria-label="Fechar o menu">
            <PanelIcon name="close" />
          </button>
        </div>
        <nav className="sidebar__nav">
          {MENU_GROUPS.map((group) => {
            const items = group.items.filter((item) => can(item.permission));
            if (items.length === 0) return null;
            return (
              <div className="nav-group" key={group.title}>
                <p className="nav-group__title">{group.title}</p>
                {items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end} title={collapsed ? item.label : undefined} className={({ isActive }) => `nav-link${isActive ? " nav-link--active" : ""}`}>
                    <PanelIcon name={item.icon} />
                    <span className="nav-link__label">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <button type="button" className="sidebar__collapse" onClick={toggleCollapsed} aria-label={collapsed ? "Expandir o menu" : "Recolher o menu"}>
          <PanelIcon name={collapsed ? "expand" : "collapse"} />
          <span className="nav-link__label">Recolher menu</span>
        </button>
      </aside>
      <button type="button" className="drawer-backdrop" onClick={() => setDrawerOpen(false)} aria-label="Fechar o menu" tabIndex={-1} />

      <div className="main">
        <header className="topbar">
          <button type="button" className="topbar__menu" onClick={() => setDrawerOpen(true)} aria-label="Abrir o menu">
            <PanelIcon name="menu" size={22} />
          </button>
          <p className="topbar__title">{findPageTitle(pathname)}</p>
          <AccountMenu admin={admin} logout={logout} />
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export { ROLE_LABELS };
