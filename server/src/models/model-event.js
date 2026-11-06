import mongoose from "mongoose";
import { DEFAULT_EVENT_APPEARANCE, EVENT_STYLES } from "../config/event-appearance.js";
import { SCHEDULE_KINDS } from "../config/event-schedule.js";

/** Evento de uma vez só (o padrão; eventos antigos não têm "schedule"). */
function isOnce(doc) {
  return (doc.schedule?.kind ?? "once") === "once";
}

export const EVENT_TYPES = Object.freeze(["xp_multiplier"]);

/**
 * Evento (coleção "events"), ex.: "2x XP no fim de semana".
 * schedule (config/event-schedule.js): "once" vale quando active = true e startsAt <= agora < endsAt; "weekly"
 * (dias da semana e horário) e "yearly" (data comemorativa) se repetem sozinhos, e aí startsAt/endsAt são
 * opcionais e só limitam o período em que a repetição vale.
 * - xp_multiplier: multiplica o XP ganho ao concluir atividades (vários eventos ao mesmo tempo:
 *   vale o MAIOR multiplicador, eles não se somam).
 * appearance: cores, estilo e ícone da faixa no app (config/event-appearance.js), escolhidos no painel.
 * Usado por: service-event.js (aplicado em service-attempt.js).
 */
const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: "", trim: true, maxlength: 200 },
    type: { type: String, enum: EVENT_TYPES, default: "xp_multiplier" },
    // Sem teto: o painel pode criar eventos de qualquer tamanho (mínimo 1 = XP normal).
    multiplier: { type: Number, required: true, min: 1 },
    startsAt: {
      type: Date,
      default: null,
      required() {
        return isOnce(this);
      },
    },
    endsAt: {
      type: Date,
      default: null,
      required() {
        return isOnce(this);
      },
      validate: {
        validator(value) {
          return !value || !this.startsAt || value > this.startsAt;
        },
        message: "O fim do evento precisa ser depois do início.",
      },
    },
    schedule: {
      _id: false,
      kind: { type: String, enum: SCHEDULE_KINDS, default: "once" },
      days: { type: [Number], default: undefined },
      startTime: String,
      endTime: String,
      month: Number,
      day: Number,
      durationDays: Number,
    },
    active: { type: Boolean, default: true },
    appearance: {
      _id: false,
      style: { type: String, enum: EVENT_STYLES, default: DEFAULT_EVENT_APPEARANCE.style },
      colorFrom: { type: String, default: DEFAULT_EVENT_APPEARANCE.colorFrom },
      colorTo: { type: String, default: DEFAULT_EVENT_APPEARANCE.colorTo },
      textColor: { type: String, default: DEFAULT_EVENT_APPEARANCE.textColor },
      accentColor: { type: String, default: DEFAULT_EVENT_APPEARANCE.accentColor },
      accentTextColor: { type: String, default: DEFAULT_EVENT_APPEARANCE.accentTextColor },
      icon: { type: String, default: "", maxlength: 8 },
    },
  },
  { timestamps: true },
);

eventSchema.index({ active: 1, startsAt: 1, endsAt: 1 });
eventSchema.index({ active: 1, "schedule.kind": 1 });

export const EventModel = mongoose.model("Event", eventSchema);
