import { EventModel } from "../models/model-event.js";
import { toPublicAppearance } from "../config/event-appearance.js";
import { createTimedCache } from "../utils/util-timed-cache.js";

/** Curto: um evento que começa ou termina passa a valer em no máximo este tempo. */
const EVENTS_CACHE_MS = 5 * 1000;
const cache = createTimedCache(EVENTS_CACHE_MS);

/**
 * Formato do evento que sai da API (para a faixa "2x XP" no app).
 * @param {object} event
 * @returns {{id: string, title: string, description: string, type: string, multiplier: number, startsAt: Date, endsAt: Date,
 *   appearance: object}}
 */
function toPublicEvent(event) {
  return {
    id: String(event._id),
    title: event.title,
    description: event.description,
    type: event.type,
    multiplier: event.multiplier,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    appearance: toPublicAppearance(event.appearance),
  };
}

/**
 * Eventos valendo agora (ativos e dentro do período), do que termina primeiro para o último.
 * @param {Date} [now]
 * @returns {Promise<ReturnType<typeof toPublicEvent>[]>}
 * Usado por: GET /internal/v1/events/active e getXpMultiplier.
 */
export async function findActiveEvents(now = new Date()) {
  const load = async () => {
    const events = await EventModel.find({ active: true, startsAt: { $lte: now }, endsAt: { $gt: now } })
      .sort({ endsAt: 1 })
      .lean();
    return events.map(toPublicEvent);
  };
  return cache.get("active", load);
}

/**
 * Multiplicador de XP valendo agora: o maior entre os eventos "xp_multiplier" ativos (1 se não houver).
 * Eventos não se somam: dois eventos de 2x ao mesmo tempo continuam dando 2x.
 * @param {Date} [now]
 * @returns {Promise<{multiplier: number, event: ReturnType<typeof toPublicEvent>|null}>}
 * Usado por: service-attempt.js (XP da atividade e de cada acerto).
 */
export async function getXpMultiplier(now = new Date()) {
  const xpEvents = (await findActiveEvents(now)).filter((event) => event.type === "xp_multiplier");
  if (xpEvents.length === 0) return { multiplier: 1, event: null };
  const best = xpEvents.reduce((top, event) => (event.multiplier > top.multiplier ? event : top));
  return { multiplier: best.multiplier, event: best };
}

/** Esquece os eventos em cache (depois de criar/alterar um evento). */
export function clearEventsCache() {
  cache.clear();
}
