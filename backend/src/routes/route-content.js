import { Router } from "express";
import * as ContentController from "../controllers/controller-content.js";
import { asyncHandler } from "../utils/util-async-handler.js";

// Sem login: só conteúdo público (o app usa os textos já na tela de entrada).
export const contentRouter = Router();

contentRouter.get("/events/active", asyncHandler(ContentController.listActiveEvents));
contentRouter.get("/app-config", asyncHandler(ContentController.getAppConfig));
