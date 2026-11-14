import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Badge, Field, LoadState, Notice, Pagination, confirmAction, formatDateTime, useAction, useLoad } from "../components/ui.jsx";

const LIMITS = { title: 80, body: 240 };

/** Um tipo de notificação automática: ligar/desligar, celular, título e texto (com as variáveis aceitas). */
function TypeRow({ item, editable, pushConfigured, onSaved }) {
  const [draft, setDraft] = useState({ title: item.title, body: item.body });
  const { run, busy, message } = useAction();
  useEffect(() => setDraft({ title: item.title, body: item.body }), [item]);

  const save = (changes, success = "Salvo.") =>
    run(async () => {
      await api(`/notifications/types/${item.type}`, { method: "PUT", body: changes });
      onSaved();
    }, success);
  const reset = () =>
    run(async () => {
      await api(`/notifications/types/${item.type}`, { method: "DELETE" });
      onSaved();
    }, "Voltou ao padrão.");

  const variables = Object.entries(item.variables ?? {});
  const dirty = draft.title !== item.title || draft.body !== item.body;
  return (
    <div className="card notification-type">
      <div className="toolbar">
        <h3>
          {item.label} {item.audience === "all" ? <Badge>para todos</Badge> : <Badge>para a pessoa</Badge>}{" "}
          {!item.enabled && <Badge tone="danger">desligada</Badge>}
        </h3>
        {editable && (
          <span className="table__actions">
            <label className="checkbox">
              <input type="checkbox" checked={item.enabled} disabled={busy} onChange={(e) => save({ enabled: e.target.checked }, e.target.checked ? "Ligada." : "Desligada.")} />
              Ligada
            </label>
            <label className="checkbox" title={pushConfigured ? "" : "Configure o Firebase no servidor para mandar ao celular."}>
              <input type="checkbox" checked={item.push} disabled={busy} onChange={(e) => save({ push: e.target.checked })} />
              Celular
            </label>
          </span>
        )}
      </div>
      <p className="muted">{item.when}</p>
      {item.manual ? (
        <p className="muted">O título e o texto são escritos em "Enviar aviso", no topo da página.</p>
      ) : (
        <>
          <div className="notification-type__fields">
            <Field label="Título">
              <input value={draft.title} maxLength={LIMITS.title} disabled={!editable} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </Field>
            <Field
              label="Texto"
              hint={variables.length ? `Variáveis: ${variables.map(([key, label]) => `{${key}} = ${label}`).join(" · ")}` : "Sem variáveis."}
            >
              <textarea rows={2} value={draft.body} maxLength={LIMITS.body} disabled={!editable} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            </Field>
          </div>
          {editable && (
            <div className="setting__actions">
              <button className="button" disabled={busy || !dirty || !draft.title.trim()} onClick={() => save({ title: draft.title, body: draft.body })}>Salvar texto</button>
              {item.customized && <button className="button button--ghost" disabled={busy} onClick={reset}>Padrão</button>}
            </div>
          )}
        </>
      )}
      {item.customized && item.updatedAt && <p className="muted small">Alterado em {formatDateTime(item.updatedAt)}{item.updatedBy ? ` por ${item.updatedBy}` : ""}</p>}
      <Notice message={message} />
    </div>
  );
}

/** Enviar aviso agora: para todos ou para uma pessoa (busca pelo apelido/e-mail). */
function SendForm({ onSent, manualEnabled }) {
  const [form, setForm] = useState({ title: "", body: "", audience: "all" });
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [target, setTarget] = useState(null);
  const { run, busy, message } = useAction();

  useEffect(() => {
    if (form.audience !== "user" || search.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    const timer = setTimeout(() => {
      api("/users", { query: { search: search.trim(), limit: 8 } }).then((data) => setResults(data.users)).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [search, form.audience]);

  const canSend = manualEnabled && form.title.trim() && (form.audience === "all" || target);
  const send = () => {
    const who = form.audience === "all" ? "TODOS os usuários" : target.nickname;
    if (!confirmAction(`Enviar "${form.title.trim()}" para ${who} agora?`)) return;
    run(async () => {
      const result = await api("/notifications/send", {
        method: "POST",
        body: { title: form.title, body: form.body, ...(form.audience === "user" ? { userId: target.id } : {}) },
      });
      setForm({ title: "", body: "", audience: form.audience });
      onSent();
      return result;
    }, "Aviso enviado. Quem está com o app aberto recebe na hora; os outros, no celular ou ao abrir o app.");
  };

  return (
    <div className="card">
      <h2>Enviar aviso</h2>
      {!manualEnabled && <Notice message={{ type: "error", text: "O tipo \"Aviso do painel\" está desligado: ligue-o acima para enviar." }} />}
      <div className="notification-type__fields">
        <Field label="Para">
          <select value={form.audience} onChange={(e) => { setForm({ ...form, audience: e.target.value }); setTarget(null); }}>
            <option value="all">Todos os usuários ativos</option>
            <option value="user">Uma pessoa</option>
          </select>
        </Field>
        {form.audience === "user" && (
          <Field label="Pessoa" hint={target ? `Selecionada: ${target.nickname} (${target.email})` : "Digite pelo menos 2 letras do apelido ou e-mail."}>
            <input value={search} placeholder="Buscar usuário…" onChange={(e) => { setSearch(e.target.value); setTarget(null); }} />
            {results.length > 0 && !target && (
              <ul className="notification-send__results">
                {results.map((user) => (
                  <li key={user.id}>
                    <button type="button" className="button button--ghost" onClick={() => { setTarget(user); setSearch(user.nickname); setResults([]); }}>
                      {user.nickname} <span className="muted">{user.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Field>
        )}
        <Field label="Título" hint={`${form.title.length}/${LIMITS.title}`}>
          <input value={form.title} maxLength={LIMITS.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Texto" hint={`${form.body.length}/${LIMITS.body}`}>
          <textarea rows={3} value={form.body} maxLength={LIMITS.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        </Field>
      </div>
      <div className="setting__actions">
        <button className="button" disabled={busy || !canSend} onClick={send}>{busy ? "Enviando…" : "Enviar agora"}</button>
      </div>
      <Notice message={message} />
    </div>
  );
}

/** Histórico: cada envio (aviso para todos = uma linha), com quantos receberam e quantos leram. */
function HistoryCard({ types, refreshKey }) {
  const [filters, setFilters] = useState({ type: "", page: 1 });
  const { data, error, loading, reload } = useLoad(
    () => api("/notifications/history", { query: { ...filters, limit: 25 } }),
    [JSON.stringify(filters), refreshKey],
  );
  return (
    <div className="card">
      <div className="toolbar">
        <h2>Histórico</h2>
        <select value={filters.type} onChange={(e) => setFilters({ type: e.target.value, page: 1 })}>
          <option value="">Todos os tipos</option>
          {types.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
        </select>
      </div>
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {data && data.items.length === 0 && <p className="muted">Nenhuma notificação enviada ainda.</p>}
      {data && data.items.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Quando</th><th>Tipo</th><th>Notificação</th><th>Para</th><th>Lidas</th></tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td>{formatDateTime(item.createdAt)}</td>
                  <td>{item.typeLabel}</td>
                  <td>
                    <strong>{item.title}</strong>
                    {item.body && <div className="muted">{item.body}</div>}
                    {item.sentBy && <div className="muted small">por {item.sentBy}</div>}
                  </td>
                  <td>{item.to ? <Link to={`/usuarios/${item.to.id}`}>{item.to.nickname}</Link> : `${item.recipients.toLocaleString("pt-BR")} pessoas`}</td>
                  <td>
                    {item.read.toLocaleString("pt-BR")}/{item.recipients.toLocaleString("pt-BR")}
                    {item.recipients > 1 && <span className="muted"> ({Math.round((item.read / item.recipients) * 100)}%)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={filters.page} pages={Math.max(1, Math.ceil(data.total / data.limit))} onChange={(page) => setFilters({ ...filters, page })} />}
    </div>
  );
}

/**
 * Notificações: todos os tipos que o app pode receber (ligar/desligar, celular, textos), enviar um aviso agora e o
 * histórico de envios com quantas pessoas leram.
 */
export function NotificationsPage() {
  const { can } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api("/notifications/types"), []);
  const [refreshKey, setRefreshKey] = useState(0);
  const editable = can("manage");
  const manual = data?.types.find((item) => item.type === "manual");

  return (
    <section>
      <h1>Notificações</h1>
      <p className="muted">
        Tudo o que pode aparecer no sino do app. Chegam na hora para quem está com o app aberto (aviso no topo) e, com
        "Celular" marcado, também como notificação do celular com o app fechado.
      </p>
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {data && !data.pushConfigured && (
        <Notice message={{ type: "error", text: "Notificação no celular desligada: falta FIREBASE_SERVICE_ACCOUNT no servidor (Render). Dentro do app, tudo funciona." }} />
      )}
      {data && data.pushConfigured && (
        <p className="muted">
          Celulares registrados para receber com o app fechado: <strong>{(data.pushDevices ?? 0).toLocaleString("pt-BR")}</strong>{" "}
          {data.pushDevices === 0 && "— abra o app 1.6 ou mais novo e aceite a permissão de notificações."}
        </p>
      )}
      {data && editable && <SendForm manualEnabled={manual?.enabled} onSent={() => setRefreshKey((key) => key + 1)} />}
      {data && (
        <>
          <h2>Tipos de notificação</h2>
          {data.types.map((item) => (
            <TypeRow key={item.type} item={item} editable={editable} pushConfigured={data.pushConfigured} onSaved={reload} />
          ))}
          <HistoryCard types={data.types} refreshKey={refreshKey} />
        </>
      )}
    </section>
  );
}
