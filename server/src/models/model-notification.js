import mongoose from "mongoose";
import { NOTIFICATION_TYPE_KEYS } from "../config/notification-types.js";

/** Notificações somem sozinhas depois de 90 dias (índice TTL). */
const KEEP_DAYS = 90;

/**
 * Notificação de uma pessoa (coleção "notifications"). Um aviso para todos vira um documento por pessoa, com o
 * mesmo batch (ex.: "manual:…", "event:<id>:2026-11-14"): o histórico do painel agrupa por ele e conta as lidas.
 * - readAt: null = não lida (bolinha no sino do app).
 * - sentBy: e-mail de quem enviou pelo painel (só nos avisos manuais).
 * Usado por: service-notification.js.
 */
const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: NOTIFICATION_TYPE_KEYS, required: true },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, default: "", maxlength: 400 },
    link: { type: String, default: "" },
    batch: { type: String, default: null },
    sentBy: { type: String, default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ batch: 1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: KEEP_DAYS * 24 * 60 * 60 });

export const NotificationModel = mongoose.model("Notification", notificationSchema);
