import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Badge, Field, LoadState, Modal, Notice, confirmAction, formatDateTime, toLocalInput, useAction, useLoad } from "../components/ui.jsx";
import { PopupPreview } from "../components/PopupPreview.jsx";
import { GithubReleaseImporter, SettingRow } from "./SettingsPage.jsx";

/** Data do formulário (datetime-local) → ISO, ou null sem data. */
const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null);
const toInput = (value) => (value ? toLocalInput(value) : "");

/* --------------------------------------------------------------------------------------------------- avisos */

const EMPTY_ANNOUNCEMENT = { title: "", message: "", notesTitle: "Novidades", notes: "", buttonText: "", link: "", active: true, startsAt: "", endsAt: "" };

/** Situação do aviso para a lista. */
function AnnouncementStatus({ item }) {
  if (!item.active) return <Badge tone="off">desligado</Badge>;
  if (item.live) return <Badge tone="ok">no ar</Badge>;
  if (item.startsAt && new Date(item.startsAt) > new Date()) return <Badge tone="warn">agendado</Badge>;
  return <Badge tone="off">encerrado</Badge>;
}

/** Criar/editar um aviso, com a prévia ao lado. */
function AnnouncementForm({ initial, onClose, onSaved }) {
  const [form, setForm] = useState(() => (initial
    ? { ...initial, startsAt: toInput(initial.startsAt), endsAt: toInput(initial.endsAt) }
    : EMPTY_ANNOUNCEMENT));
  const { run, busy, message } = useAction();
  const set = (field) => (event) => setForm({ ...form, [field]: event.target.type === "checkbox" ? event.target.checked : event.target.value });

  const save = (event) => {
    event.preventDefault();
    run(async () => {
      const body = { ...form, startsAt: fromLocalInput(form.startsAt), endsAt: fromLocalInput(form.endsAt) };
      for (const field of ["id", "version", "live", "createdAt", "updatedAt", "updatedBy"]) delete body[field];
      if (initial) await api(`/popups/announcements/${initial.id}`, { method: "PATCH", body });
      else await api("/popups/announcements", { method: "POST", body });
      onSaved();
      onClose();
    });
  };

  return (
    <Modal title={initial ? "Editar aviso" : "Novo aviso"} onClose={onClose} wide>
      <form className="popup-editor" onSubmit={save}>
        <div className="popup-editor__fields">
          <Field label="Título"><input value={form.title} maxLength={80} required onChange={set("title")} /></Field>
          <Field label="Texto" hint="Opcional. Aparece logo abaixo do título."><textarea rows={3} value={form.message} maxLength={600} onChange={set("message")} /></Field>
          <Field label="Título do quadro roxo"><input value={form.notesTitle} maxLength={40} onChange={set("notesTitle")} /></Field>
          <Field label="Quadro roxo" hint="Opcional. Vazio = sem quadro."><textarea rows={4} value={form.notes} maxLength={1000} onChange={set("notes")} /></Field>
          <Field label="Texto do botão" hint="Vazio = &quot;Entendi&quot;."><input value={form.buttonText} maxLength={40} onChange={set("buttonText")} /></Field>
          <Field label="Link do botão" hint="Opcional (https). Com link, o botão abre a página."><input type="url" placeholder="https://..." value={form.link} maxLength={500} onChange={set("link")} /></Field>
          <div className="grid-2">
            <Field label="Início" hint="Vazio = já."><input type="datetime-local" value={form.startsAt} onChange={set("startsAt")} /></Field>
            <Field label="Fim" hint="Vazio = até desligar."><input type="datetime-local" value={form.endsAt} onChange={set("endsAt")} /></Field>
          </div>
          <label className="checkbox"><input type="checkbox" checked={form.active} onChange={set("active")} /> Ligado</label>
          <Notice message={message} />
          <div className="setting__actions">
            <button className="button" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button>
            <button type="button" className="button button--ghost" onClick={onClose}>Cancelar</button>
          </div>
        </div>
        <PopupPreview title={form.title} message={form.message} notesTitle={form.notesTitle} notes={form.notes} buttonText={form.buttonText || "Entendi"} />
      </form>
    </Modal>
  );
}

function AnnouncementsTab({ editable }) {
  const { data, error, loading, reload } = useLoad(() => api("/popups/announcements"), []);
  const [editing, setEditing] = useState(null);
  const { run, message } = useAction();
  const remove = (item) => {
    if (!confirmAction(`Excluir o aviso "${item.title}"?`, { destructive: true })) return;
    run(async () => {
      await api(`/popups/announcements/${item.id}`, { method: "DELETE" });
      reload();
    }, "Aviso excluído.");
  };

  return (
    <div className="card">
      <div className="toolbar">
        <p className="muted">Cada aviso aparece uma vez em cada aparelho (editar faz aparecer de novo), enquanto estiver ligado e no período.</p>
        {editable && <button className="button" onClick={() => setEditing("new")}>Novo aviso</button>}
      </div>
      <Notice message={message} />
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {data && (data.announcements.length === 0 ? <p className="muted">Nenhum aviso ainda.</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Título</th><th>Situação</th><th>Período</th><th>Atualizado</th><th /></tr></thead>
            <tbody>
              {data.announcements.map((item) => (
                <tr key={item.id}>
                  <td>{item.title}</td>
                  <td><AnnouncementStatus item={item} /></td>
                  <td>{item.startsAt || item.endsAt ? `${formatDateTime(item.startsAt)} → ${formatDateTime(item.endsAt)}` : "sem período"}</td>
                  <td>{formatDateTime(item.updatedAt)}{item.updatedBy ? ` · ${item.updatedBy}` : ""}</td>
                  <td className="table__actions">
                    {editable && <button className="button button--ghost" onClick={() => setEditing(item)}>Editar</button>}
                    {editable && <button className="button button--ghost" onClick={() => remove(item)}>Excluir</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {editing && <AnnouncementForm initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ manutenção */

/** Valores do formulário a partir da manutenção salva. */
const toMaintenanceForm = (maintenance) => ({
  enabled: maintenance.enabled,
  startsAt: toInput(maintenance.startsAt),
  endsAt: toInput(maintenance.endsAt),
  title: maintenance.title,
  message: maintenance.message,
  notesTitle: maintenance.notesTitle,
  notes: maintenance.notes,
  buttonText: maintenance.buttonText,
  allowedEmails: maintenance.allowedEmails.join("\n"),
  startEmail: { ...maintenance.startEmail },
  endEmail: { ...maintenance.endEmail },
  endEmailAudience: maintenance.endEmailAudience,
});

/** E-mail de início ou de fim: enviar?, assunto e texto (com os padrões como dica). */
function EmailFields({ label, value, defaults, disabled, onChange, children }) {
  return (
    <fieldset className="popup-email">
      <legend>{label}</legend>
      <label className="checkbox">
        <input type="checkbox" checked={value.enabled} disabled={disabled} onChange={(event) => onChange({ ...value, enabled: event.target.checked })} /> Enviar
      </label>
      {children}
      <Field label="Assunto" hint={`Vazio = "${defaults.subject}"`}>
        <input value={value.subject} maxLength={120} disabled={disabled} onChange={(event) => onChange({ ...value, subject: event.target.value })} />
      </Field>
      <Field label="Texto" hint="Variáveis: {nome} = apelido da pessoa · {previsao} = data prevista para terminar. Vazio = texto padrão.">
        <textarea rows={4} value={value.body} maxLength={2000} placeholder={defaults.body} disabled={disabled} onChange={(event) => onChange({ ...value, body: event.target.value })} />
      </Field>
    </fieldset>
  );
}

function MaintenanceTab({ editable }) {
  const { data, error, loading, reload } = useLoad(() => api("/popups/maintenance"), []);
  const [form, setForm] = useState(null);
  const { run, busy, message } = useAction();
  useEffect(() => {
    if (data) setForm(toMaintenanceForm(data.maintenance));
  }, [data]);

  if (!form) return <LoadState loading={loading} error={error} onRetry={reload} />;
  const { maintenance } = data;
  const { defaults } = maintenance;
  const set = (field) => (event) => setForm({ ...form, [field]: event.target.type === "checkbox" ? event.target.checked : event.target.value });
  const save = (event) => {
    event.preventDefault();
    const turningOn = form.enabled && !maintenance.enabled;
    if (turningOn && !confirmAction("Ligar a manutenção? Quem não estiver na lista de liberados não vai conseguir usar o app.")) return;
    run(async () => {
      await api("/popups/maintenance", {
        method: "PUT",
        body: { ...form, startsAt: fromLocalInput(form.startsAt), endsAt: fromLocalInput(form.endsAt) },
      });
      reload();
    }, "Manutenção salva.");
  };
  const notes = form.notes || (form.endsAt ? `Volta prevista: ${new Date(form.endsAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.` : "");

  return (
    <form className="card popup-editor" onSubmit={save}>
      <div className="popup-editor__fields">
        <div className="maintenance-status">
          {maintenance.active ? <Badge tone="danger">em manutenção agora</Badge> : maintenance.enabled ? <Badge tone="warn">agendada</Badge> : <Badge tone="ok">app liberado</Badge>}
          {maintenance.startedAt && <span className="muted">começou em {formatDateTime(maintenance.startedAt)} · {maintenance.blockedCount} conta(s) barrada(s)</span>}
        </div>
        <label className="checkbox"><input type="checkbox" checked={form.enabled} disabled={!editable} onChange={set("enabled")} /> Manutenção ligada</label>
        <div className="grid-2">
          <Field label="Início" hint="Vazio = começa ao salvar."><input type="datetime-local" value={form.startsAt} disabled={!editable} onChange={set("startsAt")} /></Field>
          <Field label="Fim" hint="Vazio = até desligar aqui."><input type="datetime-local" value={form.endsAt} disabled={!editable} onChange={set("endsAt")} /></Field>
        </div>

        <h3>Pop-up</h3>
        <Field label="Título" hint={`Vazio = "${defaults.maintenanceTitle}"`}><input value={form.title} maxLength={80} disabled={!editable} onChange={set("title")} /></Field>
        <Field label="Texto" hint="Vazio = texto padrão."><textarea rows={3} value={form.message} maxLength={600} placeholder={defaults.maintenanceMessage} disabled={!editable} onChange={set("message")} /></Field>
        <Field label="Título do quadro roxo" hint={`Vazio = "${defaults.maintenanceNotesTitle}"`}><input value={form.notesTitle} maxLength={40} disabled={!editable} onChange={set("notesTitle")} /></Field>
        <Field label="Quadro roxo" hint="Vazio = mostra a previsão de volta (se tiver data de fim)."><textarea rows={3} value={form.notes} maxLength={1000} disabled={!editable} onChange={set("notes")} /></Field>
        <Field label="Texto do botão" hint={`Vazio = "${defaults.maintenanceButton}". O botão fecha o app.`}><input value={form.buttonText} maxLength={40} disabled={!editable} onChange={set("buttonText")} /></Field>

        <h3>Quem pode usar durante a manutenção</h3>
        <Field label="E-mails liberados" hint="Um por linha. Essas contas usam o app normalmente; as outras veem o pop-up e o app fecha.">
          <textarea rows={4} value={form.allowedEmails} disabled={!editable} onChange={set("allowedEmails")} />
        </Field>

        <h3>E-mails</h3>
        <EmailFields label="Quando começar (para todas as contas)" value={form.startEmail} disabled={!editable}
          defaults={{ subject: defaults.startEmailSubject, body: defaults.startEmailBody }} onChange={(startEmail) => setForm({ ...form, startEmail })} />
        <EmailFields label="Quando terminar" value={form.endEmail} disabled={!editable}
          defaults={{ subject: defaults.endEmailSubject, body: defaults.endEmailBody }} onChange={(endEmail) => setForm({ ...form, endEmail })}>
          <Field label="Para quem">
            <select value={form.endEmailAudience} disabled={!editable} onChange={set("endEmailAudience")}>
              <option value="blocked">Só quem tentou entrar e foi barrado</option>
              <option value="all">Todas as contas</option>
            </select>
          </Field>
        </EmailFields>

        <Notice message={message} />
        {editable && <div className="setting__actions"><button className="button" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button></div>}
        {maintenance.updatedBy && <p className="muted">Última alteração: {formatDateTime(maintenance.updatedAt)} · {maintenance.updatedBy}</p>}
      </div>
      <PopupPreview
        title={form.title || defaults.maintenanceTitle}
        message={form.message || defaults.maintenanceMessage}
        notesTitle={notes ? form.notesTitle || defaults.maintenanceNotesTitle : ""}
        notes={notes}
        buttonText={form.buttonText || defaults.maintenanceButton}
      />
    </form>
  );
}

/* ---------------------------------------------------------------------------------------------- atualizações */

function UpdatesTab({ editable }) {
  const { data, error, loading, reload } = useLoad(() => api("/settings"), []);
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;
  const settings = data.settings.filter((setting) => setting.key.startsWith("app.update."));
  const value = (key) => settings.find((setting) => setting.key === key)?.value ?? "";
  const message = String(value("app.update.message")).replaceAll("{versao}", value("app.update.versionName") || "nova").replaceAll("{atual}", "1.0");
  return (
    <div className="card popup-editor">
      <div className="popup-editor__fields">
        <p className="muted">
          Para avisar uma versão nova: publique uma release no GitHub (tag v1.4.0, com o APK anexado e "versionCode: N" na descrição) e use
          "Buscar no GitHub", ou preencha à mão o link público do APK e o número da versão nova. Quem tiver uma versão menor vê o pop-up.
          Com o número mínimo, versões abaixo dele ficam bloqueadas até atualizar.
        </p>
        {editable && <GithubReleaseImporter onApplied={reload} />}
        {settings.map((setting) => <SettingRow key={setting.key} setting={setting} editable={editable} onSaved={reload} />)}
      </div>
      <PopupPreview
        title={value("app.update.title")}
        message={message}
        notesTitle={value("app.update.notesTitle")}
        notes={value("app.update.notes")}
        buttonText={value("app.update.buttonText")}
        secondary={value("app.update.laterText")}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------- página */

const TABS = [
  { id: "avisos", title: "Avisos", Component: AnnouncementsTab },
  { id: "manutencao", title: "Manutenção", Component: MaintenanceTab },
  { id: "atualizacoes", title: "Atualizações", Component: UpdatesTab },
];

/** Pop-ups do app em três categorias: avisos, manutenção e atualizações (aba no endereço: #/popups?aba=manutencao). */
export function PopupsPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((item) => item.id === params.get("aba")) ?? TABS[0];
  return (
    <section>
      <h1>Pop-ups do app</h1>
      <div className="section-tabs section-tabs--page" role="tablist" aria-label="Categorias de pop-up">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={item === tab}
            className={`section-tabs__tab${item === tab ? " section-tabs__tab--active" : ""}`}
            onClick={() => setParams(item === TABS[0] ? {} : { aba: item.id }, { replace: true })}>
            {item.title}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={tab.title}>
        <tab.Component editable={can("manage")} />
      </div>
    </section>
  );
}
