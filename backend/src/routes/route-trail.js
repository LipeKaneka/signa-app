import { Router } from "express";
import * as TrailController from "../controllers/controller-trail.js";
import { requireAuth } from "../middlewares/auth-middleware.js";
import { asyncHandler } from "../utils/util-async-handler.js";

export const trailRouter = Router();

trailRouter.get("/trail", requireAuth, asyncHandler(TrailController.getTrail));
trailRouter.post("/activities/:activityId/attempts", requireAuth, asyncHandler(TrailController.startAttempt));
trailRouter.post("/attempts/:attemptId/answers", requireAuth, asyncHandler(TrailController.answerQuestion));
trailRouter.post("/attempts/:attemptId/finish", requireAuth, asyncHandler(TrailController.finishAttempt));
