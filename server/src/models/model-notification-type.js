import mongoose from "mongoose";
import { NOTIFICATION_TYPE_KEYS } from "../config/notification-types.js";

/**
 * O que o painel mudou num tipo de notificação (coleção "notificationtypes"). Sem documento = padrão de
 * config/notification-types.js. title/body vazios = usa o padrão.
 * Usado por: service-notification.js.
 */
const notificationTypeSchema = new mongoose.Schema(
  {
    type: { type: String, enum: NOTIFICATION_TYPE_KEYS, required: true, unique: true },
    enabled: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    title: { type: String, default: "", maxlength: 80 },
    body: { type: String, default: "", maxlength: 240 },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

export const NotificationTypeModel = mongoose.model("NotificationType", notificationTypeSchema);
