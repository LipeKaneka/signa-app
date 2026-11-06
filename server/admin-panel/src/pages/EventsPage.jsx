import { useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Badge, Field, LoadState, Modal, Notice, confirmAction, useAction, useLoad } from "../components/ui.jsx";
import { ScheduleFields, describeSchedule, describeWhen, scheduleBodyFrom, scheduleFormFrom } from "../event-schedule.jsx";

const STATES = {
  running: { label: "Valendo agora", tone: "ok" },
  scheduled: { label: "Agendado", tone: "neutral" },
  ended: { label: "Encerrado", tone: "off" },
  inactive: { label: "Desativado", tone: "off" },
};

/** Combinações prontas nas cores do app (dá para ajustar cada cor depois). */
const APPEARANCE_PRESETS = [
  { name: "Roxo da marca", style: "gradient", colorFrom: "#5233c4", colorTo: "#8b6cf0", textColor: "#ffffff", accentColor: "#ffffff", accentTextColor: "#3f2c88" },
  { name: "Noite", style: "gradient", colorFrom: "#19163a", colorTo: "#3f2c88", textColor: "#ffffff", accentColor: "#8b6cf0", accentTextColor: "#ffffff" },
  { name: "Contorno roxo", style: "outline", colorFrom: "#5233c4", colorTo: "#5233c4", textColor: "#19163a", accentColor: "#5233c4", accentTextColor: "#ffffff" },
  { name: "Verde", style: "gradient", colorFrom: "#1f8a4c", colorTo: "#3fc173", textColor: "#ffffff", accentColor: "#ffffff", accentTextColor: "#1f6b2a" },
  { name: "Azul", style: "gradient", colorFrom: "#2153c9", colorTo: "#5b8cf5", textColor: "#ffffff", accentColor: "#ffffff", accentTextColor: "#2153c9" },
  { name: "Rosa", style: "gradient", colorFrom: "#b8175a", colorTo: "#ec5d9b", textColor: "#ffffff", accentColor: "#ffffff", accentTextColor: "#b8175a" },
  { name: "Dourado (antigo)", style: "gradient", colorFrom: "#ffb820", colorTo: "#ffd56b", textColor: "#2a1a00", accentColor: "#2a1a00", accentTextColor: "#ffd56b" },
];
const DEFAULT_APPEARANCE = { ...APPEARANCE_PRESETS[0], icon: "" };
delete DEFAULT_APPEARANCE.name;
const STYLE_LABELS = { gradient: "Degradê", solid: "Cor sólida", outline: "Contorno (fundo claro)" };
const COLOR_FIELDS = [
  ["colorFrom", "Cor principal"],
  ["colorTo", "Segunda cor (degradê)"],
  ["textColor", "Texto"],
  ["accentColor", "Fundo do selo"],
  ["accentTextColor", "Texto do selo"],
];

/** Mesmo cálculo de estilo da faixa do app (frontend/src/components/EventBanner.jsx). */
function bannerStyle(appearance) {
  const background = appearance.style === "gradient"
    ? `linear-gradient(90deg, ${appearance.colorFrom} 0%, ${appearance.colorTo} 100%)`
    : appearance.style === "solid" ? appearance.colorFrom : "#ffffff";
  return {
    background,
    color: appearance.textColor,
    border: appearance.style === "outline" ? `2px solid ${appearance.colorFrom}` : "2px solid transparent",
  };
}

/** Prévia da faixa como ela aparece no app. */
function EventPreview({ title, description, multiplier, appearance }) {
  const label = `${String(multiplier || 1).replace(".", ",")}x`;
  return (
    <div className="event-preview" aria-label="Prévia no app">
      <div className="event-preview__phone">
        <div className="event-preview__banner" style={bannerStyle(appearance)}>
          <span className="event-preview__badge" style={{ background: appearance.accentColor, color: appearance.accentTextColor }}>{label}</span>
          <div>
            <strong>{appearance.icon ? `${appearance.icon} ` : ""}{title || "Título do evento"}</strong>
            <span>Todo XP vale {label} até dom., 22:00{description ? ` · ${description}` : ""}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Formulário de evento de XP: uma vez (datas deste computador), toda semana ou todo ano (horário de Brasília). */
function EventForm({ event, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: event?.title ?? "",
    description: event?.description ?? "",
    multiplier: event?.multiplier ?? 2,
    appearance: { ...DEFAULT_APPEARANCE, ...(event?.appearance ?? {}) },
  });
  const [schedule, setSchedule] = useState(() => scheduleFormFrom(event));
  const applyPreset = (preset) => {
    setSchedule((current) => ({ ...current, ...preset.schedule, limited: false }));
    setForm((current) => ({ ...current, title: current.title.trim() ? current.title : preset.title }));
  };
  const setAppearance = (changes) => setForm((current) => ({ ...current, appearance: { ...current.appearance, ...changes } }));
  const { run, busy, message } = useAction();
  const set = (changes) => setForm({ ...form, ...changes });

  const submit = (submitEvent) => {
    submitEvent.preventDefault();
    const body = { ...form, multiplier: Number(form.multiplier), ...scheduleBodyFrom(schedule) };
    run(async () => {
      await api(event ? `/events/${event.id}` : "/events", { method: event ? "PATCH" : "POST", body });
      onSaved();
    });
  };

  return (
    <Modal title={event ? "Editar evento" : "Novo evento de XP"} onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <Field label="Título" hint='Aparece para os usuários (ex.: "Fim de semana 2x XP").'>
          <input value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={80} required />
        </Field>
        <Field label="Descrição"><input value={form.description} onChange={(e) => set({ description: e.target.value })} maxLength={200} /></Field>
        <Field label="Multiplicador de XP" hint="A partir de 1, sem limite (aceita decimais, ex.: 1.5). Se dois eventos valerem juntos, vale o maior (não somam).">
          <input type="number" min={1} step="any" value={form.multiplier} onChange={(e) => set({ multiplier: e.target.value })} required />
        </Field>
        <fieldset className="appearance-editor">
          <legend>Aparência no app</legend>
          <EventPreview title={form.title} description={form.description} multiplier={form.multiplier} appearance={form.appearance} />
          <div className="preset-list" role="group" aria-label="Combinações prontas">
            {APPEARANCE_PRESETS.map(({ name, ...preset }) => (
              <button key={name} type="button" className="preset" onClick={() => setAppearance(preset)} title={name}>
                <span className="preset__swatch" style={bannerStyle({ ...DEFAULT_APPEARANCE, ...preset })} />
                <span>{name}</span>
              </button>
            ))}
          </div>
          <div className="form__row">
            <Field label="Estilo">
              <select value={form.appearance.style} onChange={(e) => setAppearance({ style: e.target.value })}>
                {Object.entries(STYLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Ícone (opcional)" hint="Um emoji antes do título, ex.: 🔥 ⭐ 🎉">
              <input value={form.appearance.icon} onChange={(e) => setAppearance({ icon: e.target.value })} maxLength={8} />
            </Field>
          </div>
          <div className="color-grid">
            {COLOR_FIELDS.filter(([field]) => field !== "colorTo" || form.appearance.style === "gradient").map(([field, label]) => (
              <label key={field} className="color-field">
                <input type="color" value={form.appearance[field]} onChange={(e) => setAppearance({ [field]: e.target.value })} />
                <span>{label}<code>{form.appearance[field]}</code></span>
              </label>
            ))}
          </div>
        </fieldset>
        <ScheduleFields form={schedule} onChange={setSchedule} onPreset={applyPreset} />
        <Notice message={message} />
        <div className="form__actions">
          <button type="button" className="button button--ghost" onClick={onClose}>Cancelar</button>
          <button className="button" disabled={busy || (schedule.kind === "weekly" && schedule.days.length === 0)}>Salvar</button>
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
      <p className="muted">
        O multiplicador vale para o XP de cada acerto e o da atividade concluída enquanto o evento estiver valendo. Eventos
        "toda semana" (ex.: fim de semana) e "todo ano" (datas comemorativas) começam e terminam sozinhos.
      </p>
      <Notice message={message} />
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {data && data.events.length === 0 && <p className="muted">Nenhum evento cadastrado.</p>}
      {data && data.events.length > 0 && (
        <table className="table">
          <thead><tr><th>Evento</th><th>Multiplicador</th><th>Quando</th><th>Situação</th><th /></tr></thead>
          <tbody>
            {data.events.map((event) => (
              <tr key={event.id}>
                <td>
                  <span className="event-swatch" style={bannerStyle({ ...DEFAULT_APPEARANCE, ...event.appearance })} aria-hidden="true" />
                  <strong>{event.appearance?.icon ? `${event.appearance.icon} ` : ""}{event.title}</strong>
                  <div className="field__hint">{event.description}</div>
                </td>
                <td>{event.multiplier}x</td>
                <td>
                  {event.schedule?.kind && event.schedule.kind !== "once" && <strong className="schedule-label">{describeSchedule(event.schedule)}</strong>}
                  <div className={event.schedule?.kind && event.schedule.kind !== "once" ? "field__hint" : undefined}>{describeWhen(event)}</div>
                </td>
                <td><Badge tone={STATES[event.state].tone}>{STATES[event.state].label}</Badge></td>
                <td className="table__actions">
                  {can("manage") && (
                    <>
                      {event.state !== "ended" && <button className="button button--ghost" onClick={() => setEditing(event)}>Editar</button>}
                      {event.state === "running" && (event.schedule?.kind ?? "once") === "once" && <button className="button button--ghost" onClick={() => endNow(event)}>Encerrar agora</button>}
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
