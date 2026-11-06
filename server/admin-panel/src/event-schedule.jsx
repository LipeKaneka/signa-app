import { Field, formatDateTime, toLocalInput } from "./components/ui.jsx";

/** Dias da semana na ordem de exibição (seg → dom); value = 0 domingo ... 6 sábado (como no servidor). */
const WEEKDAYS = [
  [1, "Seg"], [2, "Ter"], [3, "Qua"], [4, "Qui"], [5, "Sex"], [6, "Sáb"], [0, "Dom"],
];
const WEEKDAY_NAMES = ["dom.", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."];
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Atalhos: momentos que se repetem e datas comemorativas (o título só é preenchido se estiver vazio). */
export const SCHEDULE_PRESETS = [
  { name: "Fim de semana", title: "Fim de semana 2x XP", schedule: { kind: "weekly", days: [6, 0], startTime: "00:00", endTime: "24:00" } },
  { name: "Sexta à noite", title: "Sextou com XP", schedule: { kind: "weekly", days: [5], startTime: "18:00", endTime: "24:00" } },
  { name: "Dia Nacional da Libras (24/04)", title: "Dia Nacional da Libras", schedule: { kind: "yearly", month: 4, day: 24, durationDays: 1 } },
  { name: "Dia das Línguas de Sinais (23/09)", title: "Dia Internacional das Línguas de Sinais", schedule: { kind: "yearly", month: 9, day: 23, durationDays: 1 } },
  { name: "Dia Nacional do Surdo (26/09)", title: "Dia Nacional do Surdo", schedule: { kind: "yearly", month: 9, day: 26, durationDays: 1 } },
  { name: "Setembro Azul (mês todo)", title: "Setembro Azul", schedule: { kind: "yearly", month: 9, day: 1, durationDays: 30 } },
  { name: "Dia das Crianças (12/10)", title: "Dia das Crianças", schedule: { kind: "yearly", month: 10, day: 12, durationDays: 1 } },
  { name: "Natal (24 e 25/12)", title: "Natal com XP", schedule: { kind: "yearly", month: 12, day: 24, durationDays: 2 } },
  { name: "Virada do ano (31/12 e 01/01)", title: "Ano novo, XP novo", schedule: { kind: "yearly", month: 12, day: 31, durationDays: 2 } },
];

/**
 * "Todo sáb. e dom. (dia inteiro)", "Toda sex., 18:00–24:00", "Todo ano em 24 de abril (1 dia)" ou "Uma vez".
 * @param {object} schedule
 * @returns {string}
 */
export function describeSchedule(schedule) {
  if (!schedule || schedule.kind === "once") return "Uma vez";
  if (schedule.kind === "weekly") {
    const ordered = WEEKDAYS.map(([value]) => value).filter((value) => schedule.days.includes(value));
    const names = ordered.map((value) => WEEKDAY_NAMES[value]);
    const list = names.length === 7 ? "dia" : names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}` : names[0];
    const allDay = schedule.startTime === "00:00" && schedule.endTime === "24:00";
    return `Todo ${list}${allDay ? " (dia inteiro)" : `, ${schedule.startTime}–${schedule.endTime}`}`;
  }
  const days = schedule.durationDays === 1 ? "1 dia" : `${schedule.durationDays} dias`;
  return `Todo ano em ${schedule.day} de ${MONTHS[schedule.month - 1]} (${days})`;
}

/** Estado inicial do formulário a partir de um evento (ou de um evento novo de 2 dias). */
export function scheduleFormFrom(event) {
  const now = Date.now();
  const schedule = event?.schedule?.kind ? event.schedule : { kind: "once" };
  const recurring = schedule.kind !== "once";
  return {
    kind: schedule.kind,
    days: schedule.days ?? [6, 0],
    startTime: schedule.startTime ?? "00:00",
    endTime: schedule.endTime ?? "24:00",
    month: schedule.month ?? 4,
    day: schedule.day ?? 24,
    durationDays: schedule.durationDays ?? 1,
    // Recorrente: o período é só um limite opcional.
    limited: recurring ? Boolean(event?.startsAt || event?.endsAt) : true,
    startsAt: event?.startsAt ? toLocalInput(event.startsAt) : toLocalInput(now),
    endsAt: event?.endsAt ? toLocalInput(event.endsAt) : toLocalInput(now + (recurring ? 90 : 2) * 24 * 60 * 60 * 1000),
  };
}

/**
 * Campos do corpo da API a partir do formulário: {schedule, startsAt, endsAt}.
 * @param {ReturnType<typeof scheduleFormFrom>} form
 */
export function scheduleBodyFrom(form) {
  const dates = { startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString() };
  if (form.kind === "once") return { schedule: { kind: "once" }, ...dates };
  const limits = form.limited ? dates : { startsAt: null, endsAt: null };
  if (form.kind === "weekly") {
    return { schedule: { kind: "weekly", days: form.days, startTime: form.startTime, endTime: form.endTime }, ...limits };
  }
  return { schedule: { kind: "yearly", month: Number(form.month), day: Number(form.day), durationDays: Number(form.durationDays) }, ...limits };
}

/**
 * "Agora, até dom., 23:59" / "Próxima: sáb., 00:00" / período do evento de uma vez.
 * @param {object} event - do GET /events (com occurrence e state).
 */
export function describeWhen(event) {
  if (!event.schedule || event.schedule.kind === "once") return `${formatDateTime(event.startsAt)} → ${formatDateTime(event.endsAt)}`;
  if (event.state === "running" && event.occurrence) return `Valendo até ${formatDateTime(event.occurrence.endsAt)}`;
  if (event.occurrence) return `Próxima: ${formatDateTime(event.occurrence.startsAt)} → ${formatDateTime(event.occurrence.endsAt)}`;
  return "Sem próximas datas";
}

/** Escolha de quando o evento acontece: uma vez, toda semana ou todo ano (com atalhos de datas comemorativas). */
export function ScheduleFields({ form, onChange, onPreset }) {
  const set = (changes) => onChange({ ...form, ...changes });
  const allDay = form.startTime === "00:00" && form.endTime === "24:00";
  const toggleDay = (value) => set({ days: form.days.includes(value) ? form.days.filter((day) => day !== value) : [...form.days, value] });

  return (
    <fieldset className="schedule-editor">
      <legend>Quando acontece</legend>
      <div className="segmented" role="radiogroup" aria-label="Tipo de agenda">
        {[["once", "Uma vez"], ["weekly", "Toda semana"], ["yearly", "Todo ano (data comemorativa)"]].map(([value, label]) => (
          <button key={value} type="button" role="radio" aria-checked={form.kind === value} className={form.kind === value ? "segmented__on" : ""} onClick={() => set({ kind: value })}>
            {label}
          </button>
        ))}
      </div>

      <div className="preset-list" role="group" aria-label="Atalhos de datas">
        {SCHEDULE_PRESETS.map((preset) => (
          <button key={preset.name} type="button" className="preset" onClick={() => onPreset(preset)}>
            <span>{preset.name}</span>
          </button>
        ))}
      </div>

      {form.kind === "weekly" && (
        <>
          <div className="weekday-picker" role="group" aria-label="Dias da semana">
            {WEEKDAYS.map(([value, label]) => (
              <label key={value} className={form.days.includes(value) ? "weekday weekday--on" : "weekday"}>
                <input type="checkbox" checked={form.days.includes(value)} onChange={() => toggleDay(value)} />
                {label}
              </label>
            ))}
          </div>
          <div className="form__row">
            <Field label="Horário">
              <label className="check">
                <input type="checkbox" checked={allDay} onChange={(e) => set(e.target.checked ? { startTime: "00:00", endTime: "24:00" } : { startTime: "18:00", endTime: "22:00" })} />
                Dia inteiro
              </label>
            </Field>
            {!allDay && (
              <div className="form__row">
                <Field label="Das"><input type="time" value={form.startTime} onChange={(e) => set({ startTime: e.target.value })} required /></Field>
                <Field label="Até"><input type="time" value={form.endTime === "24:00" ? "23:59" : form.endTime} onChange={(e) => set({ endTime: e.target.value })} required /></Field>
              </div>
            )}
          </div>
        </>
      )}

      {form.kind === "yearly" && (
        <div className="form__row form__row--3">
          <Field label="Dia">
            <input type="number" min={1} max={DAYS_IN_MONTH[form.month - 1]} value={form.day} onChange={(e) => set({ day: Number(e.target.value) })} required />
          </Field>
          <Field label="Mês">
            <select value={form.month} onChange={(e) => set({ month: Number(e.target.value), day: Math.min(form.day, DAYS_IN_MONTH[Number(e.target.value) - 1]) })}>
              {MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
            </select>
          </Field>
          <Field label="Dura (dias)">
            <input type="number" min={1} max={366} value={form.durationDays} onChange={(e) => set({ durationDays: Number(e.target.value) })} required />
          </Field>
        </div>
      )}

      {form.kind !== "once" && (
        <>
          <p className="muted schedule-summary">
            {describeSchedule(scheduleBodyFrom(form).schedule)} · horário de Brasília. Começa e termina sozinho, sem precisar mexer no painel.
          </p>
          <label className="check">
            <input type="checkbox" checked={form.limited} onChange={(e) => set({ limited: e.target.checked })} />
            Só vale dentro de um período (ex.: só neste semestre)
          </label>
        </>
      )}

      {(form.kind === "once" || form.limited) && (
        <div className="form__row">
          <Field label={form.kind === "once" ? "Começa" : "Vale a partir de"}>
            <input type="datetime-local" value={form.startsAt} onChange={(e) => set({ startsAt: e.target.value })} required />
          </Field>
          <Field label={form.kind === "once" ? "Termina" : "Vale até"}>
            <input type="datetime-local" value={form.endsAt} onChange={(e) => set({ endsAt: e.target.value })} required />
          </Field>
        </div>
      )}
      {form.kind === "weekly" && form.days.length === 0 && <p className="field__error">Escolha pelo menos um dia.</p>}
    </fieldset>
  );
}
