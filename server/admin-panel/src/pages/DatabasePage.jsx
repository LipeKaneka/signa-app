import { useEffect, useState } from "react";
import { api, downloadExport, downloadFile } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Badge, LoadState, Modal, Notice, Pagination, confirmAction, formatDateTime, useAction, useLoad } from "../components/ui.jsx";
import { PanelIcon } from "../components/icons.jsx";
import { Num, formatCompact } from "../format-number.jsx";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Valor de uma célula da tabela (datas legíveis, objetos resumidos). */
function formatCell(value) {
  if (value === null || value === undefined || value === "") return <span className="muted">—</span>;
  if (typeof value === "boolean") return value ? <Badge tone="ok">sim</Badge> : <Badge tone="off">não</Badge>;
  if (typeof value === "string" && ISO_DATE.test(value)) return formatDateTime(value);
  if (Array.isArray(value)) return <span className="muted">[{value.length} itens]</span>;
  if (typeof value === "object") return <code className="cell-json">{JSON.stringify(value).slice(0, 60)}</code>;
  return String(value);
}

/** Tipo do campo pelo valor atual: decide o controle de edição e como converter o texto de volta. */
function fieldKind(value) {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  if (value === null || value === undefined) return "loose";
  return "json";
}

const toDraft = (value, kind) => (kind === "json" ? JSON.stringify(value, null, 2) : kind === "boolean" ? value : value ?? "");

/** Texto digitado → valor a gravar. @throws {Error} com mensagem amigável se o JSON estiver inválido. */
function parseDraft(draft, kind, field) {
  if (kind === "boolean") return Boolean(draft);
  if (kind === "string") return draft;
  if (kind === "number") {
    if (draft === "" || Number.isNaN(Number(draft))) throw new Error(`"${field}" precisa ser um número.`);
    return Number(draft);
  }
  const text = String(draft).trim();
  if (kind === "loose") {
    if (text === "") return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`"${field}" precisa ser um JSON válido (lista ou objeto).`);
  }
}

/** Editor de um campo, conforme o tipo. */
function FieldEditor({ field, kind, draft, onChange, disabled }) {
  if (kind === "boolean") {
    return (
      <label className="checkbox">
        <input type="checkbox" checked={Boolean(draft)} onChange={(e) => onChange(e.target.checked)} disabled={disabled} /> {draft ? "sim" : "não"}
      </label>
    );
  }
  if (kind === "json" || (typeof draft === "string" && draft.length > 80)) {
    return <textarea rows={Math.min(14, String(draft).split("\n").length + 1)} value={draft} onChange={(e) => onChange(e.target.value)} disabled={disabled} spellCheck={false} className="mono" aria-label={field} />;
  }
  return <input type={kind === "number" ? "number" : "text"} value={draft} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label={field} placeholder={kind === "loose" ? "vazio = null; aceita texto ou JSON" : undefined} />;
}

/** Documento aberto: campos editáveis (com validação no servidor), só leitura à parte, excluir com confirmação. */
function DocumentModal({ collection, id, onClose, onChanged }) {
  const { data, error, loading } = useLoad(() => api(`/database/collections/${collection.key}/documents/${id}`), [collection.key, id]);
  const [drafts, setDrafts] = useState({});
  const saving = useAction();
  const deleting = useAction();
  const document = data?.document;
  const writable = new Set(collection.editable ? collection.writableFields : []);

  useEffect(() => {
    if (!document) return;
    setDrafts(Object.fromEntries(collection.writableFields.map((field) => [field, toDraft(document[field], fieldKind(document[field]))])));
  }, [document, collection.writableFields]);

  if (!document) return <Modal title="Documento" onClose={onClose} wide><LoadState loading={loading} error={error} /></Modal>;

  const readonlyEntries = Object.entries(document).filter(([field]) => !writable.has(field));
  const changedFields = collection.editable
    ? collection.writableFields.filter((field) => drafts[field] !== undefined && drafts[field] !== toDraft(document[field], fieldKind(document[field])))
    : [];

  const save = () =>
    saving.run(async () => {
      const changes = Object.fromEntries(changedFields.map((field) => [field, parseDraft(drafts[field], fieldKind(document[field]), field)]));
      await api(`/database/collections/${collection.key}/documents/${id}`, { method: "PATCH", body: { changes } });
      onChanged();
      onClose();
    });
  const remove = () => {
    if (!confirmAction(`Excluir este documento de "${collection.label}" para sempre?${collection.key === "users" ? " As tentativas da pessoa também serão apagadas." : ""}`, { destructive: true })) return;
    deleting.run(async () => {
      await api(`/database/collections/${collection.key}/documents/${id}`, { method: "DELETE", body: { confirm: "EXCLUIR" } });
      onChanged();
      onClose();
    });
  };

  return (
    <Modal title={`${collection.label} · ${id}`} onClose={onClose} wide>
      {collection.editable && collection.writableFields.length > 0 && (
        <div className="doc-fields">
          {collection.writableFields.map((field) => (
            <div className={`doc-field${changedFields.includes(field) ? " doc-field--changed" : ""}`} key={field}>
              <span className="doc-field__name">{field}</span>
              <FieldEditor field={field} kind={fieldKind(document[field])} draft={drafts[field] ?? ""} onChange={(value) => setDrafts((current) => ({ ...current, [field]: value }))} disabled={saving.busy} />
            </div>
          ))}
        </div>
      )}
      <details className="doc-readonly" open={!collection.editable}>
        <summary>Campos só leitura ({readonlyEntries.length})</summary>
        <pre>{JSON.stringify(Object.fromEntries(readonlyEntries), null, 2)}</pre>
      </details>
      <Notice message={saving.message ?? deleting.message} />
      <div className="form__actions">
        {collection.deletable && <button type="button" className="button button--danger" onClick={remove} disabled={deleting.busy}>Excluir</button>}
        <span className="spacer" />
        <button type="button" className="button button--ghost" onClick={onClose}>Fechar</button>
        {collection.editable && (
          <button type="button" className="button" onClick={save} disabled={saving.busy || changedFields.length === 0}>
            {saving.busy ? "Salvando…" : changedFields.length ? `Salvar (${changedFields.length})` : "Salvar"}
          </button>
        )}
      </div>
    </Modal>
  );
}

/** Novo documento: JSON com os campos permitidos; o servidor valida com as regras do modelo. */
function CreateModal({ collection, onClose, onCreated }) {
  const [text, setText] = useState(() => JSON.stringify(Object.fromEntries(collection.writableFields.map((field) => [field, null])), null, 2));
  const { run, busy, message } = useAction();
  const create = () =>
    run(async () => {
      let document;
      try {
        document = JSON.parse(text);
      } catch {
        throw new Error("JSON inválido. Confira vírgulas e aspas.");
      }
      // Campos deixados como null não vão: o modelo usa o valor padrão deles.
      const cleaned = Object.fromEntries(Object.entries(document).filter(([, value]) => value !== null));
      await api(`/database/collections/${collection.key}/documents`, { method: "POST", body: { document: cleaned } });
      onCreated();
      onClose();
    });
  return (
    <Modal title={`Novo documento em ${collection.label}`} onClose={onClose} wide>
      <p className="muted small">Preencha os campos (deixe <code>null</code> para usar o padrão). Datas no formato <code>2026-11-04T10:00:00Z</code>.</p>
      <textarea className="mono" rows={16} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="Documento em JSON" />
      <Notice message={message} />
      <div className="form__actions">
        <button type="button" className="button button--ghost" onClick={onClose}>Cancelar</button>
        <button type="button" className="button" onClick={create} disabled={busy}>{busy ? "Criando…" : "Criar"}</button>
      </div>
    </Modal>
  );
}

/** Explorador: escolhe a coleção, busca, pagina e abre documentos. Só para o dono. */
function DatabaseExplorer() {
  const collections = useLoad(() => api("/database/collections"), []);
  const [selectedKey, setSelectedKey] = useState("users");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const exporting = useAction();
  const list = useLoad(() => api(`/database/collections/${selectedKey}/documents`, { query: { search: query, page, limit: 25 } }), [selectedKey, query, page]);
  const collection = collections.data?.collections.find((item) => item.key === selectedKey);

  // Busca ao parar de digitar.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const choose = (key) => {
    setSelectedKey(key);
    setSearch("");
    setQuery("");
    setPage(1);
  };
  const refresh = () => {
    list.reload();
    collections.reload();
  };

  return (
    <div className="db-explorer">
      <aside className="db-explorer__collections" aria-label="Coleções">
        <label className="db-explorer__select">
          <span className="field__label">Coleção</span>
          <select value={selectedKey} onChange={(e) => choose(e.target.value)}>
            {(collections.data?.collections ?? []).map((item) => <option key={item.key} value={item.key}>{item.label} ({item.count})</option>)}
          </select>
        </label>
        <ul className="db-explorer__list">
          {(collections.data?.collections ?? []).map((item) => (
            <li key={item.key}>
              <button type="button" className={item.key === selectedKey ? "is-on" : ""} onClick={() => choose(item.key)}>
                <span>{item.label}</span>
                <span className="db-explorer__count"><Num value={item.count} /></span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="db-explorer__main">
        <LoadState loading={collections.loading && !collections.data} error={collections.error} onRetry={collections.reload} />
        {collection && (
          <>
            <div className="db-explorer__toolbar">
              <div>
                <h2>{collection.label}</h2>
                <p className="muted small">
                  <code>{collection.key}</code> · {list.data ? `${formatCompact(list.data.total)} documentos` : "…"}
                  {" · "}
                  {collection.editable ? "editável" : "só leitura"}
                  {collection.deletable ? " · permite excluir" : ""}
                </p>
              </div>
              <div className="db-explorer__actions">
                {collection.creatable && <button type="button" className="button" onClick={() => setCreating(true)}>+ Novo</button>}
                <button type="button" className="button button--ghost" disabled={exporting.busy} onClick={() => exporting.run(() => downloadFile(`/database/collections/${collection.key}/export`, { format: "json" }))}>JSON</button>
                <button type="button" className="button button--ghost" disabled={exporting.busy} onClick={() => exporting.run(() => downloadFile(`/database/collections/${collection.key}/export`, { format: "csv" }))}>CSV</button>
                <button type="button" className="button button--ghost button--icon" onClick={refresh} aria-label="Atualizar"><PanelIcon name="refresh" size={18} /></button>
              </div>
            </div>
            {collection.note && <p className="notice notice--info">{collection.note}</p>}
            <Notice message={exporting.message} />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar (texto ou _id)…" aria-label="Buscar na coleção" className="db-explorer__search" />
            <LoadState loading={list.loading && !list.data} error={list.error} onRetry={list.reload} />
            {list.data && (
              <div className={`table-wrap${list.loading ? " is-refreshing" : ""}`}>
                <table className="table table--clickable">
                  <thead>
                    <tr>{collection.columns.map((column) => <th key={column}>{column}</th>)}<th aria-label="Ações" /></tr>
                  </thead>
                  <tbody>
                    {list.data.documents.length === 0 && (
                      <tr><td colSpan={collection.columns.length + 1} className="muted">Nada encontrado.</td></tr>
                    )}
                    {list.data.documents.map((document) => (
                      <tr key={document._id} onClick={() => setOpenId(document._id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpenId(document._id)}>
                        {collection.columns.map((column) => <td key={column}>{formatCell(document[column])}</td>)}
                        <td className="num"><span className="link">Abrir</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {list.data && <Pagination page={list.data.page} pages={list.data.pages} onChange={setPage} />}
          </>
        )}
      </div>

      {openId && collection && <DocumentModal collection={collection} id={openId} onClose={() => setOpenId(null)} onChanged={refresh} />}
      {creating && collection && <CreateModal collection={collection} onClose={() => setCreating(false)} onCreated={refresh} />}
    </div>
  );
}

/**
 * Banco de dados: explorador das coleções (só o dono) e ferramentas de conteúdo (exportar e seed).
 */
export function DatabasePage() {
  const { can } = useAuth();
  const exporting = useAction();
  const seeding = useAction();

  const runSeed = () => {
    if (!confirmAction("Criar o conteúdo padrão que estiver faltando? Nada que já existe é alterado.")) return;
    seeding.run(async () => {
      const { summary } = await api("/database/seed", { method: "POST" });
      return summary;
    }, "Seed concluído. Itens que já existiam não foram alterados.");
  };

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Banco de dados</h1>
          <p className="muted">Veja e ajuste os dados sem abrir o MongoDB. Toda alteração passa pelas regras do sistema e fica na auditoria.</p>
        </div>
      </div>

      {can("admins") ? (
        <div className="card card--flush">
          <DatabaseExplorer />
        </div>
      ) : (
        <p className="notice notice--info">O explorador do banco é exclusivo da conta Dono (owner).</p>
      )}

      <div className="grid-2">
        <div className="card">
          <h2>Exportar conteúdo</h2>
          <p className="muted">Arquivo JSON com sinais, módulos, atividades (com gabarito), conquistas, eventos, níveis e configurações. Sem usuários, senhas nem contas do painel.</p>
          <button className="button" disabled={exporting.busy} onClick={() => exporting.run(downloadExport, "Arquivo baixado.")}>Baixar JSON</button>
          <Notice message={exporting.message} />
        </div>
        <div className="card">
          <h2>Conteúdo padrão (seed)</h2>
          <p className="muted">Recria o que faltar do conteúdo inicial (sinais, trilha, conquistas, níveis). Útil se algo foi excluído por engano.</p>
          <button className="button button--ghost" disabled={seeding.busy} onClick={runSeed}>Rodar seed</button>
          <Notice message={seeding.message} />
        </div>
      </div>
    </section>
  );
}
