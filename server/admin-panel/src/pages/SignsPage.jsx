import { useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { ActiveBadge, Badge, Field, LoadState, Modal, Notice, Pagination, confirmAction, useAction, useLoad } from "../components/ui.jsx";

/** Formulário de verbete (criar ou editar). */
function SignForm({ sign, categories, onClose, onSaved }) {
  const [form, setForm] = useState({
    word: sign?.word ?? "",
    category: sign?.category ?? "",
    description: sign?.description ?? "",
    vlibrasGloss: sign?.vlibrasGloss ?? "",
    glossReviewed: sign?.glossReviewed ?? false,
  });
  const { run, busy, message } = useAction();
  const set = (changes) => setForm({ ...form, ...changes });

  const submit = (event) => {
    event.preventDefault();
    run(async () => {
      await api(sign ? `/signs/${sign.slug}` : "/signs", { method: sign ? "PATCH" : "POST", body: form });
      onSaved();
    });
  };

  return (
    <Modal title={sign ? `Editar "${sign.word}"` : "Novo verbete"} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Palavra" hint={sign ? `Identificador: ${sign.slug} (não muda)` : "O identificador é gerado a partir da palavra."}>
          <input value={form.word} onChange={(e) => set({ word: e.target.value })} maxLength={120} required />
        </Field>
        <Field label="Categoria">
          <input list="sign-categories" value={form.category} onChange={(e) => set({ category: e.target.value })} maxLength={60} required />
          <datalist id="sign-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist>
        </Field>
        <Field label="Descrição"><textarea value={form.description} onChange={(e) => set({ description: e.target.value })} maxLength={1000} rows={3} /></Field>
        <Field label="Glosa VLibras" hint="O texto que o avatar sinaliza (em maiúsculas). Vazio = sem avatar.">
          <input value={form.vlibrasGloss} onChange={(e) => set({ vlibrasGloss: e.target.value })} maxLength={120} />
        </Field>
        <label className="checkbox">
          <input type="checkbox" checked={form.glossReviewed} onChange={(e) => set({ glossReviewed: e.target.checked })} />
          Glosa conferida por pessoa fluente em Libras
        </label>
        <Notice message={message} />
        <div className="form__actions">
          <button type="button" className="button button--ghost" onClick={onClose}>Cancelar</button>
          <button className="button" disabled={busy}>Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

/** Dicionário: busca, filtros, criar, editar, ativar/desativar e excluir verbetes. */
export function SignsPage() {
  const { can } = useAuth();
  const [filters, setFilters] = useState({ search: "", category: "", status: "", page: 1 });
  const { data, error, loading, reload } = useLoad(() => api("/signs", { query: { ...filters, limit: 30 } }), [JSON.stringify(filters)]);
  const [editing, setEditing] = useState(null);
  const { run, message } = useAction();
  const setFilter = (changes) => setFilters({ ...filters, page: 1, ...changes });

  const toggle = (sign) =>
    run(async () => {
      await api(`/signs/${sign.slug}`, { method: "PATCH", body: { active: !sign.active } });
      reload();
    });
  const remove = (sign) => {
    if (!confirmAction(`Excluir de vez "${sign.word}"?`, { destructive: true })) return;
    run(async () => {
      await api(`/signs/${sign.slug}`, { method: "DELETE" });
      reload();
    });
  };

  return (
    <section>
      <div className="toolbar">
        <h1>Dicionário</h1>
        {can("content") && <button className="button" onClick={() => setEditing("new")}>Novo verbete</button>}
      </div>
      <div className="filters">
        <input type="search" placeholder="Buscar palavra" value={filters.search} onChange={(e) => setFilter({ search: e.target.value })} />
        <select value={filters.category} onChange={(e) => setFilter({ category: e.target.value })}>
          <option value="">Todas as categorias</option>
          {(data?.categories ?? []).map((category) => <option key={category}>{category}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setFilter({ status: e.target.value })}>
          <option value="">Ativos e desativados</option>
          <option value="active">Só ativos</option>
          <option value="inactive">Só desativados</option>
        </select>
      </div>
      <Notice message={message} />
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {data && (
        <>
          <p className="muted">{data.total} verbetes</p>
          <table className="table">
            <thead><tr><th>Palavra</th><th>Categoria</th><th>Glosa</th><th>Situação</th><th /></tr></thead>
            <tbody>
              {data.signs.map((sign) => (
                <tr key={sign.slug}>
                  <td><strong>{sign.word}</strong><div className="field__hint">{sign.slug}</div></td>
                  <td>{sign.category}</td>
                  <td>{sign.vlibrasGloss ?? "—"} {sign.vlibrasGloss && !sign.glossReviewed && <Badge tone="warn">não revisada</Badge>}</td>
                  <td><ActiveBadge active={sign.active} /></td>
                  <td className="table__actions">
                    {can("content") && (
                      <>
                        <button className="button button--ghost" onClick={() => setEditing(sign)}>Editar</button>
                        <button className="button button--ghost" onClick={() => toggle(sign)}>{sign.active ? "Desativar" : "Ativar"}</button>
                      </>
                    )}
                    {can("manage") && !sign.active && <button className="button button--danger" onClick={() => remove(sign)}>Excluir</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={data.page} pages={data.pages} onChange={(page) => setFilters({ ...filters, page })} />
        </>
      )}
      {editing && (
        <SignForm
          sign={editing === "new" ? null : editing}
          categories={data?.categories ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </section>
  );
}
