import { Router } from "express";
import * as NotificationController from "../controllers/controller-notification.js";
import { requireAuth } from "../middlewares/auth-middleware.js";
import { asyncHandler } from "../utils/util-async-handler.js";

/** Notificações do app: lista, marcar como lidas e o fluxo em tempo real. */
export const notificationRouter = Router();

notificationRouter.get("/notifications", requireAuth, asyncHandler(NotificationController.list));
notificationRouter.post("/notifications/read", requireAuth, asyncHandler(NotificationController.markRead));
notificationRouter.get("/notifications/stream", requireAuth, NotificationController.stream);
