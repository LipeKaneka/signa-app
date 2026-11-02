import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import logoBranca from "../assets/brand/logo-branca.svg";
import tipografiaBranca from "../assets/brand/tipografia-branca.svg";

const ROLE_LABELS = { owner: "Dono", admin: "Administrador", editor: "Editor", viewer: "Leitura" };

/** Itens do menu e a permissão necessária para ver cada um. */
const MENU = [
  { to: "/", label: "Início", permission: "read", end: true },
  { to: "/trilha", label: "Trilha", permission: "read" },
  { to: "/exercicios", label: "Exercícios", permission: "read" },
  { to: "/dicionario", label: "Dicionário", permission: "read" },
  { to: "/conquistas", label: "Conquistas", permission: "read" },
  { to: "/eventos", label: "Eventos de XP", permission: "read" },
  { to: "/niveis", label: "Níveis", permission: "read" },
  { to: "/configuracoes", label: "Configurações", permission: "read" },
  { to: "/usuarios", label: "Usuários", permission: "read" },
  { to: "/auditoria", label: "Auditoria", permission: "manage" },
  { to: "/banco", label: "Banco de dados", permission: "manage" },
  { to: "/administradores", label: "Administradores", permission: "admins" },
];

/** Estrutura das páginas logadas: menu lateral + conteúdo. */
export function Layout() {
  const { admin, can, logout } = useAuth();
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <img src={logoBranca} alt="" className="sidebar__hand" />
          <div>
            <img src={tipografiaBranca} alt="Signa Ludus" className="sidebar__name" />
            <span>Painel</span>
          </div>
        </div>
        <nav className="sidebar__nav">
          {MENU.filter((item) => can(item.permission)).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link ${isActive ? "nav-link--active" : ""}`}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__account">
          <NavLink to="/conta" className="sidebar__who">
            <strong>{admin.name}</strong>
            <span>{ROLE_LABELS[admin.role]} · {admin.email}</span>
          </NavLink>
          <button className="button button--ghost button--light" onClick={logout}>Sair</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

export { ROLE_LABELS };
