import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { Badge, LoadState, Pagination, formatDateTime, useLoad } from "../components/ui.jsx";
import { Num } from "../format-number.jsx";

/** Usuários do app: busca e filtro; o detalhe tem progresso e ações de moderação. */
export function UsersPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ search: "", status: "", page: 1 });
  const { data, error, loading, reload } = useLoad(() => api("/users", { query: { ...filters, limit: 30 } }), [JSON.stringify(filters)]);
  const setFilter = (changes) => setFilters({ ...filters, page: 1, ...changes });

  return (
    <section>
      <h1>Usuários do app</h1>
      <div className="filters">
        <input type="search" placeholder="Apelido, e-mail ou id público" value={filters.search} onChange={(e) => setFilter({ search: e.target.value })} />
        <select value={filters.status} onChange={(e) => setFilter({ status: e.target.value })}>
          <option value="">Todos</option>
          <option value="active">Ativos</option>
          <option value="blocked">Banidos</option>
        </select>
      </div>
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {data && (
        <>
          <p className="muted">{data.total} usuários</p>
          <table className="table">
            <thead><tr><th>Usuário</th><th>XP</th><th>Ofensiva</th><th>Atividades</th><th>Último login</th><th>Situação</th></tr></thead>
            <tbody>
              {data.users.map((user) => (
                // A linha inteira abre o usuário; o nome continua sendo link (teclado e leitor de tela).
                <tr key={user.id} className="table__row--link" onClick={() => navigate(`/usuarios/${user.id}`)}>
                  <td><Link to={`/usuarios/${user.id}`} onClick={(e) => e.stopPropagation()}><strong>{user.nickname}</strong></Link><div className="field__hint">{user.email}</div></td>
                  <td><Num value={user.xp} /></td>
                  <td>{user.streak}</td>
                  <td>{user.completedActivities}</td>
                  <td>{formatDateTime(user.lastLogin)}</td>
                  <td>{user.status === "blocked" ? <span title={user.ban?.until ? `até ${formatDateTime(user.ban.until)}` : "sem prazo"}><Badge tone="danger">{user.ban?.until ? `Banido até ${new Date(user.ban.until).toLocaleDateString("pt-BR")}` : "Banido"}</Badge></span> : <Badge tone="ok">Ativo</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={data.page} pages={data.pages} onChange={(page) => setFilters({ ...filters, page })} />
        </>
      )}
    </section>
  );
}
