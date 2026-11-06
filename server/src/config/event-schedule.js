/**
 * Quando um evento acontece (escolhido no painel). Todos os horários são de Brasília (UTC-3, sem horário de verão).
 * - once: uma vez só, de startsAt até endsAt (o formato de sempre).
 * - weekly: toda semana, nos dias escolhidos (days: 0 = domingo ... 6 = sábado), das startTime às endTime
 *   ("00:00" a "24:00" = dia inteiro). Dias inteiros seguidos viram uma ocorrência só (sábado + domingo = fim de semana).
 * - yearly: todo ano na mesma data (month 1-12, day 1-31), começando à meia-noite e durando durationDays dias
 *   (ex.: Dia Nacional da Libras, 24/04, 1 dia).
 * Nos recorrentes, startsAt/endsAt (opcionais) limitam o período em que a recorrência vale.
 */
export const SCHEDULE_KINDS = Object.freeze(["once", "weekly", "yearly"]);

const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$|^24:00$/;
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** "HH:MM" em minutos desde a meia-noite ("24:00" = 1440). */
function toMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** Meia-noite (em Brasília) do dia de "date", como Date, e o dia da semana/ano desse dia. */
function localDay(date) {
  const shifted = new Date(date.getTime() - BRASILIA_OFFSET_MS);
  const midnight = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) + BRASILIA_OFFSET_MS;
  return { midnight, weekday: shifted.getUTCDay(), year: shifted.getUTCFullYear() };
}

/**
 * Lê e valida a recorrência enviada pelo painel.
 * @param {unknown} value
 * @returns {{kind: string, days?: number[], startTime?: string, endTime?: string, month?: number, day?: number, durationDays?: number}}
 * @throws {Error} com mensagem para o painel (o controller transforma em 400).
 */
export function readEventSchedule(value) {
  if (value === undefined || value === null) return { kind: "once" };
  if (typeof value !== "object" || !SCHEDULE_KINDS.includes(value.kind)) throw new Error("Escolha quando o evento acontece.");
  if (value.kind === "once") return { kind: "once" };

  if (value.kind === "weekly") {
    const days = Array.isArray(value.days) ? [...new Set(value.days)].sort((a, b) => a - b) : [];
    if (days.length === 0 || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
      throw new Error("Escolha pelo menos um dia da semana.");
    }
    const startTime = value.startTime ?? "00:00";
    const endTime = value.endTime ?? "24:00";
    if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime) || startTime === "24:00") throw new Error("Horário inválido (use HH:MM).");
    if (toMinutes(endTime) <= toMinutes(startTime)) throw new Error("O horário de fim precisa ser depois do início.");
    return { kind: "weekly", days, startTime, endTime };
  }

  const month = value.month;
  const day = value.day;
  const durationDays = value.durationDays ?? 1;
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error("Mês inválido.");
  if (!Number.isInteger(day) || day < 1 || day > DAYS_IN_MONTH[month - 1]) throw new Error("Dia inválido para esse mês.");
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 366) throw new Error("Duração: de 1 a 366 dias.");
  return { kind: "yearly", month, day, durationDays };
}

/** Ocorrências semanais perto de "now" (do dia anterior a 8 dias à frente), já juntando dias inteiros seguidos. */
function weeklyWindows(schedule, now) {
  const { midnight, weekday } = localDay(now);
  const start = toMinutes(schedule.startTime);
  const end = toMinutes(schedule.endTime);
  const allDay = start === 0 && end === 1440;
  const windows = [];
  for (let offset = -7; offset <= 8; offset += 1) {
    const dayWeekday = (((weekday + offset) % 7) + 7) % 7;
    if (!schedule.days.includes(dayWeekday)) continue;
    const dayStart = midnight + offset * DAY_MS;
    const window = { startsAt: dayStart + start * 60_000, endsAt: dayStart + end * 60_000 };
    const previous = windows[windows.length - 1];
    if (allDay && previous && previous.endsAt === window.startsAt) previous.endsAt = window.endsAt;
    else windows.push(window);
  }
  return windows;
}

/** Ocorrências anuais do ano anterior até o seguinte. */
function yearlyWindows(schedule, now) {
  const { year } = localDay(now);
  return [year - 1, year, year + 1]
    .filter((candidate) => schedule.month !== 2 || schedule.day !== 29 || new Date(Date.UTC(candidate, 1, 29)).getUTCMonth() === 1)
    .map((candidate) => {
      const startsAt = Date.UTC(candidate, schedule.month - 1, schedule.day) + BRASILIA_OFFSET_MS;
      return { startsAt, endsAt: startsAt + schedule.durationDays * DAY_MS };
    });
}

/**
 * Ocorrências de um evento recorrente perto de "now", limitadas ao período de validade (startsAt/endsAt do evento).
 * @param {{schedule: object, startsAt?: Date|null, endsAt?: Date|null}} event
 * @param {Date} now
 * @returns {{startsAt: number, endsAt: number}[]}
 */
function windowsFor(event, now) {
  const schedule = event.schedule;
  const windows = schedule.kind === "weekly" ? weeklyWindows(schedule, now) : yearlyWindows(schedule, now);
  const from = event.startsAt ? new Date(event.startsAt).getTime() : -Infinity;
  const until = event.endsAt ? new Date(event.endsAt).getTime() : Infinity;
  return windows
    .map((window) => ({ startsAt: Math.max(window.startsAt, from), endsAt: Math.min(window.endsAt, until) }))
    .filter((window) => window.endsAt > window.startsAt);
}

/** true se o evento for recorrente (semanal ou anual). */
export function isRecurring(event) {
  return event.schedule?.kind === "weekly" || event.schedule?.kind === "yearly";
}

/**
 * Ocorrência valendo agora, ou null. Para "once", é o próprio período do evento.
 * @param {object} event
 * @param {Date} [now]
 * @returns {{startsAt: Date, endsAt: Date}|null}
 */
export function currentOccurrence(event, now = new Date()) {
  if (!isRecurring(event)) {
    const startsAt = new Date(event.startsAt);
    const endsAt = new Date(event.endsAt);
    return startsAt <= now && endsAt > now ? { startsAt, endsAt } : null;
  }
  const time = now.getTime();
  const window = windowsFor(event, now).find((candidate) => candidate.startsAt <= time && candidate.endsAt > time);
  return window ? { startsAt: new Date(window.startsAt), endsAt: new Date(window.endsAt) } : null;
}

/**
 * Próxima ocorrência que ainda vai começar (para o painel mostrar "próxima: sáb., 00:00"), ou null se não houver
 * (período de validade terminou). Procura até 2 anos à frente.
 * @param {object} event
 * @param {Date} [now]
 * @returns {{startsAt: Date, endsAt: Date}|null}
 */
export function nextOccurrence(event, now = new Date()) {
  if (!isRecurring(event)) {
    const startsAt = new Date(event.startsAt);
    return startsAt > now ? { startsAt, endsAt: new Date(event.endsAt) } : null;
  }
  const time = now.getTime();
  const window = windowsFor(event, now).find((candidate) => candidate.startsAt > time)
    ?? windowsFor(event, new Date(time + 366 * DAY_MS)).find((candidate) => candidate.startsAt > time);
  return window ? { startsAt: new Date(window.startsAt), endsAt: new Date(window.endsAt) } : null;
}
