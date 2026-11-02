import { Router } from "express";
import * as ChatController from "../controllers/controller-chat.js";
import { requireAuth } from "../middlewares/auth-middleware.js";
import { chatLimiter } from "../middlewares/rateLimit-middleware.js";
import { asyncHandler } from "../utils/util-async-handler.js";

export const chatRouter = Router();

chatRouter.post("/chat", requireAuth, chatLimiter, asyncHandler(ChatController.askAssistant));
