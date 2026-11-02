import { useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Badge, Field, LoadState, Modal, Notice, confirmAction, formatDateTime, toLocalInput, useAction, useLoad } from "../components/ui.jsx";

const STATES = {
  running: { label: "Valendo agora", tone: "ok" },
  scheduled: { label: "Agendado", tone: "neutral" },
  ended: { label: "Encerrado", tone: "off" },
  inactive: { label: "Desativado", tone: "off" },
};

/** Formulário de evento de XP (datas no horário deste computador). */
function EventForm({ event, onClose, onSaved }) {
  const now = Date.now();
  const [form, setForm] = useState({
    title: event?.title ?? "",
    description: event?.description ?? "",
    multiplier: event?.multiplier ?? 2,
    startsAt: toLocalInput(event?.startsAt ?? now),
    endsAt: toLocalInput(event?.endsAt ?? now + 2 * 24 * 60 * 60 * 1000),
  });
  const { run, busy, message } = useAction();
  const set = (changes) => setForm({ ...form, ...changes });

  const submit = (submitEvent) => {
    submitEvent.preventDefault();
    const body = {
      ...form,
      multiplier: Number(form.multiplier),
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
    };
    run(async () => {
      await api(event ? `/events/${event.id}` : "/events", { method: event ? "PATCH" : "POST", body });
      onSaved();
    });
  };

  return (
    <Modal title={event ? "Editar evento" : "Novo evento de XP"} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Título" hint='Aparece para os usuários (ex.: "Fim de semana 2x XP").'>
          <input value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={80} required />
        </Field>
        <Field label="Descrição"><input value={form.description} onChange={(e) => set({ description: e.target.value })} maxLength={200} /></Field>
        <Field label="Multiplicador de XP" hint="De 1 a 10. Se dois eventos valerem juntos, vale o maior (não somam).">
          <input type="number" min={1} max={10} step={0.5} value={form.multiplier} onChange={(e) => set({ multiplier: e.target.value })} required />
        </Field>
        <div className="form__row">
          <Field label="Começa"><input type="datetime-local" value={form.startsAt} onChange={(e) => set({ startsAt: e.target.value })} required /></Field>
          <Field label="Termina"><input type="datetime-local" value={form.endsAt} onChange={(e) => set({ endsAt: e.target.value })} required /></Field>
        </div>
        <Notice message={message} />
        <div className="form__actions">
          <button type="button" className="button button--ghost" onClick={onClose}>Cancelar</button>
          <button className="button" disabled={busy}>Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

/** Eventos de XP: agendar, encerrar agora, desativar e excluir. */
export function EventsPage() {
  const { can } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api("/events"), []);
  const [editing, setEditing] = useState(null);
  const { run, message } = useAction();

  const act = (action) => run(async () => {
    await action();
    reload();
  });
  const endNow = (event) => confirmAction(`Encerrar agora "${event.title}"?`) && act(() => api(`/events/${event.id}/end`, { method: "POST" }));
  const toggle = (event) => act(() => api(`/events/${event.id}`, { method: "PATCH", body: { active: event.state === "inactive" } }));
  const remove = (event) =>
    confirmAction(`Excluir de vez "${event.title}"?`, { destructive: true }) && act(() => api(`/events/${event.id}`, { method: "DELETE" }));

  return (
    <section>
      <div className="toolbar">
        <h1>Eventos de XP</h1>
        {can("manage") && <button className="button" onClick={() => setEditing("new")}>Novo evento</button>}
      </div>
      <p className="muted">O multiplicador vale para o XP de cada acerto e o da atividade concluída enquanto o evento estiver valendo.</p>
      <Notice message={message} />
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {data && data.events.length === 0 && <p className="muted">Nenhum evento cadastrado.</p>}
      {data && data.events.length > 0 && (
        <table className="table">
          <thead><tr><th>Evento</th><th>Multiplicador</th><th>Período</th><th>Situação</th><th /></tr></thead>
          <tbody>
            {data.events.map((event) => (
              <tr key={event.id}>
                <td><strong>{event.title}</strong><div className="field__hint">{event.description}</div></td>
                <td>{event.multiplier}x</td>
                <td>{formatDateTime(event.startsAt)} → {formatDateTime(event.endsAt)}</td>
                <td><Badge tone={STATES[event.state].tone}>{STATES[event.state].label}</Badge></td>
                <td className="table__actions">
                  {can("manage") && (
                    <>
                      {event.state !== "ended" && <button className="button button--ghost" onClick={() => setEditing(event)}>Editar</button>}
                      {event.state === "running" && <button className="button button--ghost" onClick={() => endNow(event)}>Encerrar agora</button>}
                      {event.state !== "ended" && <button className="button button--ghost" onClick={() => toggle(event)}>{event.state === "inactive" ? "Ativar" : "Desativar"}</button>}
                      {(event.state === "inactive" || event.state === "ended") && <button className="button button--danger" onClick={() => remove(event)}>Excluir</button>}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && (
        <EventForm
          event={editing === "new" ? null : editing}
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
