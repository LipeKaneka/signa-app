import { useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { ROLE_LABELS } from "../components/Layout.jsx";
import { Badge, Field, LoadState, Modal, Notice, confirmAction, formatDateTime, useAction, useLoad } from "../components/ui.jsx";

const ROLE_HINTS = {
  owner: "tudo, inclusive contas do painel",
  admin: "conteúdo, eventos, níveis, configurações, usuários, auditoria",
  editor: "módulos, atividades, dicionário e conquistas",
  viewer: "só visualizar",
};

/** Seletor de papel com a descrição de cada um. */
function RoleSelect({ value, onChange, disabled }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {Object.keys(ROLE_LABELS).map((role) => <option key={role} value={role}>{ROLE_LABELS[role]} — {ROLE_HINTS[role]}</option>)}
    </select>
  );
}

/** Criar conta ou definir senha nova (a pessoa troca depois em "Minha conta"). */
function AdminForm({ target, onClose, onSaved }) {
  const [form, setForm] = useState({ email: "", name: "", role: "editor", password: "" });
  const { run, busy, message } = useAction();
  const set = (changes) => setForm({ ...form, ...changes });
  const submit = (event) => {
    event.preventDefault();
    run(async () => {
      if (target) await api(`/admins/${target.id}/password`, { method: "POST", body: { password: form.password } });
      else await api("/admins", { method: "POST", body: form });
      onSaved();
    });
  };
  return (
    <Modal title={target ? `Senha nova para ${target.email}` : "Nova conta do painel"} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {!target && (
          <>
            <Field label="Nome"><input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} required /></Field>
            <Field label="E-mail"><input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} required /></Field>
            <Field label="Papel"><RoleSelect value={form.role} onChange={(role) => set({ role })} /></Field>
          </>
        )}
        <Field label="Senha inicial" hint="12+ caracteres com letras e números. Passe para a pessoa por um canal seguro; ela troca em Minha conta.">
          <input type="password" autoComplete="new-password" value={form.password} onChange={(e) => set({ password: e.target.value })} required />
        </Field>
        <Notice message={message} />
        <div className="form__actions">
          <button type="button" className="button button--ghost" onClick={onClose}>Cancelar</button>
          <button className="button" disabled={busy}>Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

/** Contas do painel (só owner): criar, mudar papel, desativar, redefinir senha. */
export function AdminsPage() {
  const { admin: me } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api("/admins"), []);
  const [editing, setEditing] = useState(null);
  const { run, message } = useAction();

  const update = (target, changes, text) =>
    (!text || confirmAction(text)) &&
    run(async () => {
      await api(`/admins/${target.id}`, { method: "PATCH", body: changes });
      reload();
    }, "Conta atualizada. As sessões dela foram encerradas se o papel ou status mudou.");

  return (
    <section>
      <div className="toolbar">
        <h1>Administradores</h1>
        <button className="button" onClick={() => setEditing("new")}>Nova conta</button>
      </div>
      <p className="muted">Contas são desativadas em vez de apagadas, para o histórico da auditoria continuar legível.</p>
      <Notice message={message} />
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {data && (
        <table className="table">
          <thead><tr><th>Conta</th><th>Papel</th><th>Último login</th><th>Situação</th><th /></tr></thead>
          <tbody>
            {data.admins.map((account) => {
              const isMe = account.id === me.id;
              return (
                <tr key={account.id}>
                  <td><strong>{account.name}</strong> {isMe && <Badge>você</Badge>}<div className="field__hint">{account.email}</div></td>
                  <td><RoleSelect value={account.role} disabled={isMe} onChange={(role) => update(account, { role }, `Mudar o papel de ${account.email} para ${ROLE_LABELS[role]}?`)} /></td>
                  <td>{formatDateTime(account.lastLogin)}</td>
                  <td>{account.status === "active" ? <Badge tone="ok">Ativa</Badge> : <Badge tone="off">Desativada</Badge>}</td>
                  <td className="table__actions">
                    {!isMe && (
                      <>
                        <button className="button button--ghost" onClick={() => setEditing(account)}>Senha nova</button>
                        {account.status === "active"
                          ? <button className="button button--ghost" onClick={() => update(account, { status: "disabled" }, `Desativar ${account.email}?`)}>Desativar</button>
                          : <button className="button button--ghost" onClick={() => update(account, { status: "active" })}>Reativar</button>}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {editing && (
        <AdminForm
          target={editing === "new" ? null : editing}
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
