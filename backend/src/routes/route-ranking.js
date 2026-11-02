import { Router } from "express";
import * as RankingController from "../controllers/controller-ranking.js";
import { requireAuth } from "../middlewares/auth-middleware.js";
import { asyncHandler } from "../utils/util-async-handler.js";

export const rankingRouter = Router();

rankingRouter.get("/ranking", requireAuth, asyncHandler(RankingController.getRanking));
