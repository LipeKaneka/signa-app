import mongoose from "mongoose";

export const EVENT_TYPES = Object.freeze(["xp_multiplier"]);

/**
 * Evento temporário (coleção "events"), ex.: "2x XP no fim de semana".
 * Vale quando active = true e startsAt <= agora < endsAt.
 * - xp_multiplier: multiplica o XP ganho ao concluir atividades (vários eventos ao mesmo tempo:
 *   vale o MAIOR multiplicador, eles não se somam).
 * Usado por: service-event.js (aplicado em service-attempt.js).
 */
const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: "", trim: true, maxlength: 200 },
    type: { type: String, enum: EVENT_TYPES, default: "xp_multiplier" },
    multiplier: { type: Number, required: true, min: 1, max: 10 },
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
  },
  { timestamps: true },
);

eventSchema.index({ active: 1, startsAt: 1, endsAt: 1 });

export const EventModel = mongoose.model("Event", eventSchema);
