import { Router } from "express";
import * as TrailController from "../controllers/controller-trail.js";
import { requireToken } from "../middlewares/auth-middleware.js";
import { asyncHandler } from "../utils/util-async-handler.js";

export const trailRouter = Router();

trailRouter.get("/trail", requireToken, asyncHandler(TrailController.getTrail));
trailRouter.post("/activities/:activityId/attempts", requireToken, asyncHandler(TrailController.startAttempt));
trailRouter.post("/attempts/:attemptId/answers", requireToken, asyncHandler(TrailController.answerQuestion));
trailRouter.post("/attempts/:attemptId/finish", requireToken, asyncHandler(TrailController.finishAttempt));
