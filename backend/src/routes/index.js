import { Router } from "express";
import { userRouter } from "./route-user.js";
import { trailRouter } from "./route-trail.js";
import { rankingRouter } from "./route-ranking.js";
import { dictionaryRouter } from "./route-dictionary.js";
import { chatRouter } from "./route-chat.js";
import { contentRouter } from "./route-content.js";
import { notificationRouter } from "./route-notification.js";

/**
 * Todas as rotas da API, montadas em /api/v1 pelo app.js. Lista completa no README do backend.
 */
export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => res.json({ status: "ok" }));
apiRouter.use(userRouter);
apiRouter.use(dictionaryRouter);
apiRouter.use(rankingRouter);
apiRouter.use(chatRouter);
apiRouter.use(contentRouter);
apiRouter.use(notificationRouter);
apiRouter.use(trailRouter);
