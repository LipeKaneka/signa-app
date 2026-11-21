import { Router } from "express";
import * as RankingController from "../controllers/controller-ranking.js";
import { requireToken } from "../middlewares/auth-middleware.js";
import { asyncHandler } from "../utils/util-async-handler.js";

export const rankingRouter = Router();

rankingRouter.get("/ranking", requireToken, asyncHandler(RankingController.getRanking));
