import mongoose from "mongoose";
import { DEFAULT_EVENT_APPEARANCE, EVENT_STYLES } from "../config/event-appearance.js";

export const EVENT_TYPES = Object.freeze(["xp_multiplier"]);

/**
 * Evento temporário (coleção "events"), ex.: "2x XP no fim de semana".
 * Vale quando active = true e startsAt <= agora < endsAt.
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
    startsAt: { type: Date, required: true },
    endsAt: {
      type: Date,
      required: true,
      validate: {
        validator(value) {
          return !this.startsAt || value > this.startsAt;
        },
        message: "O fim do evento precisa ser depois do início.",
      },
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

export const EventModel = mongoose.model("Event", eventSchema);
