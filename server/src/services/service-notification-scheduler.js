import { NotificationModel } from "../models/model-notification.js";
import { UserModel } from "../models/model-user.js";
import { findActiveEvents } from "./service-event.js";
import { toDayKey } from "./service-streak.js";
import { notifyAll, notifyUsers } from "./service-notification.js";
import { syncMaintenance } from "./service-popups.js";
import { APP_UPDATE_SYNC_INTERVAL_MS, syncAppUpdateFromGithub } from "./service-app-update-sync.js";

/** Confere a cada minuto. */
const TICK_MS = 60 * 1000;
/** Evento que começou há mais que isso (ex.: servidor ligado no meio dele) não avisa. */
const EVENT_START_WINDOW_MS = 6 * 60 * 60 * 1000;
/** Lembrete da ofensiva: a partir desta hora de Brasília, até o fim do dia. */
const STREAK_REMINDER_HOUR = 19;

/** Hora (0–23) em Brasília. */
const HOUR_FORMAT = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" });
function hourInBrasilia(now) {
  return Number(HOUR_FORMAT.format(now));
}

/**
 * Avisa todo mundo dos eventos que começaram agora (uma vez por ocorrência: os semanais avisam toda semana).
 * @param {Date} now
 * @returns {Promise<number>} quantos eventos avisaram.
 */
export async function notifyStartedEvents(now = new Date()) {
  let sent = 0;
  for (const event of await findActiveEvents(now)) {
    const startsAt = new Date(event.startsAt);
    if (Number.isNaN(startsAt.getTime()) || now - startsAt > EVENT_START_WINDOW_MS) continue;
    const batch = `event:${event.id}:${startsAt.toISOString()}`;
    const count = await notifyAll("event_started", {
      event: event.title,
      description: event.description || (event.multiplier > 1 ? `XP ${event.multiplier}x por tempo limitado.` : ""),
      multiplier: event.multiplier,
    }, batch);
    if (count > 0) sent += 1;
  }
  return sent;
}

/**
 * Lembrete para quem estudou ontem e ainda não hoje (uma vez por dia por pessoa), a partir das 19h de Brasília.
 * @param {Date} now
 * @returns {Promise<number>} quantas pessoas foram lembradas.
 */
export async function remindStreaks(now = new Date()) {
  if (hourInBrasilia(now) < STREAK_REMINDER_HOUR) return 0;
  const yesterday = toDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const users = await UserModel.find({ status: "active", lastActivityDay: yesterday, streak: { $gt: 0 } }).select("streak").lean();
  if (users.length === 0) return 0;
  // Começo do dia de hoje em Brasília (UTC−3, sem horário de verão desde 2019).
  const startOfToday = new Date(`${toDayKey(now)}T00:00:00-03:00`);
  const reminded = new Set((await NotificationModel.distinct("user", {
    type: "streak_reminder",
    createdAt: { $gte: startOfToday },
    user: { $in: users.map((user) => user._id) },
  })).map(String));
  // Em lote: quem tem a mesma ofensiva recebe o mesmo texto (um insert por grupo, não um por pessoa).
  const pending = users.filter((user) => !reminded.has(String(user._id)));
  await notifyUsers("streak_reminder", pending.map((user) => ({ userId: user._id, values: { streak: user.streak } })));
  return pending.length;
}

let timer = null;
/** Última conferência de release nova no GitHub (0 = ainda não conferiu desde que o servidor ligou). */
let lastAppUpdateSyncAt = 0;

/**
 * Liga a conferência de minuto em minuto (eventos que começaram e lembretes de ofensiva).
 * Usado por: index.js (não roda nos testes).
 */
export function startNotificationScheduler() {
  if (timer) return;
  const tick = async () => {
    try {
      const now = new Date();
      await notifyStartedEvents(now);
      await remindStreaks(now);
      // Manutenção agendada que começou ou terminou: marca e manda os e-mails configurados.
      await syncMaintenance(now);
      // Release nova no GitHub: aplica sozinho a atualização do app (a cada 10 min; logo ao ligar também).
      if (now - lastAppUpdateSyncAt >= APP_UPDATE_SYNC_INTERVAL_MS) {
        lastAppUpdateSyncAt = now.getTime();
        await syncAppUpdateFromGithub();
      }
    } catch (error) {
      console.error("Conferência de notificações falhou:", error.message);
    }
  };
  timer = setInterval(tick, TICK_MS);
  timer.unref?.();
  setTimeout(tick, 5000).unref?.();
}

/** Desliga a conferência (ao desligar o servidor). */
export function stopNotificationScheduler() {
  clearInterval(timer);
  timer = null;
}
