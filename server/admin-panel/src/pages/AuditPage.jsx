import { useState } from "react";
import { api } from "../api.js";
import { LoadState, Pagination, formatDateTime, useLoad } from "../components/ui.jsx";

const ENTITIES = {
  module: "Módulo", activity: "Atividade", sign: "Verbete", achievement: "Conquista", event: "Evento",
  level: "Níveis", setting: "Configuração", user: "Usuário", admin: "Painel", database: "Banco",
};

/** Auditoria: quem mudou o quê e quando, com antes/depois. */
export function AuditPage() {
  const [filters, setFilters] = useState({ entity: "", adminEmail: "", page: 1 });
  const { data, error, loading, reload } = useLoad(() => api("/audit-log", { query: { ...filters, limit: 50 } }), [JSON.stringify(filters)]);
  const [open, setOpen] = useState(null);
  const setFilter = (changes) => setFilters({ ...filters, page: 1, ...changes });

  return (
    <section>
      <h1>Auditoria</h1>
      <div className="filters">
        <select value={filters.entity} onChange={(e) => setFilter({ entity: e.target.value })}>
          <option value="">Tudo</option>
          {Object.entries(ENTITIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <input type="search" placeholder="E-mail do administrador" value={filters.adminEmail} onChange={(e) => setFilter({ adminEmail: e.target.value })} />
      </div>
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {data && (
        <>
          <table className="table">
            <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>O quê</th><th /></tr></thead>
            <tbody>
              {data.logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.createdAt)}</td>
                  <td>{log.adminEmail ?? "—"}<div className="field__hint">{log.ip}</div></td>
                  <td>{log.action}</td>
                  <td>{ENTITIES[log.entity] ?? log.entity}: {log.summary}</td>
                  <td>{(log.before || log.after) && <button className="link" onClick={() => setOpen(open === log.id ? null : log.id)}>{open === log.id ? "Fechar" : "Detalhes"}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {open && (() => {
            const log = data.logs.find((entry) => entry.id === open);
            return (
              <div className="card diff">
                <div><h3>Antes</h3><pre>{JSON.stringify(log.before, null, 2)}</pre></div>
                <div><h3>Depois</h3><pre>{JSON.stringify(log.after, null, 2)}</pre></div>
              </div>
            );
          })()}
          <Pagination page={data.page} pages={data.pages} onChange={(page) => setFilters({ ...filters, page })} />
        </>
      )}
    </section>
  );
}
