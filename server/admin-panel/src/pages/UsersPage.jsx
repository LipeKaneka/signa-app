import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { Badge, LoadState, Pagination, formatDateTime, useLoad } from "../components/ui.jsx";

/** Usuários do app: busca e filtro; o detalhe tem progresso e ações de moderação. */
export function UsersPage() {
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
          <option value="blocked">Bloqueados</option>
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
                <tr key={user.id}>
                  <td><Link to={`/usuarios/${user.id}`}><strong>{user.nickname}</strong></Link><div className="field__hint">{user.email}</div></td>
                  <td>{user.xp}</td>
                  <td>{user.streak}</td>
                  <td>{user.completedActivities}</td>
                  <td>{formatDateTime(user.lastLogin)}</td>
                  <td>{user.status === "blocked" ? <Badge tone="danger">Bloqueado</Badge> : <Badge tone="ok">Ativo</Badge>}</td>
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
