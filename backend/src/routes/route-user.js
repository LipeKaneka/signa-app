import { Router } from "express";
import * as UserController from "../controllers/controller-user.js";
import { requireAuth, requireToken } from "../middlewares/auth-middleware.js";
import { authLimiter } from "../middlewares/rateLimit-middleware.js";
import { asyncHandler } from "../utils/util-async-handler.js";

export const userRouter = Router();

userRouter.post("/auth/register", authLimiter, asyncHandler(UserController.createAccount));
userRouter.post("/auth/login", authLimiter, asyncHandler(UserController.signIn));
userRouter.post("/auth/google", authLimiter, asyncHandler(UserController.googleSignIn));
userRouter.post("/auth/password-reset/request", authLimiter, asyncHandler(UserController.requestPasswordReset));
userRouter.post("/auth/password-reset/verify", authLimiter, asyncHandler(UserController.verifyPasswordReset));
userRouter.post("/auth/password-reset/confirm", authLimiter, asyncHandler(UserController.confirmPasswordReset));

userRouter.get("/auth/session", requireAuth, UserController.getSession);
userRouter.get("/profile", requireToken, asyncHandler(UserController.getProfile));
userRouter.post("/profile/events", requireToken, asyncHandler(UserController.recordEvents));
userRouter.patch("/profile", requireToken, asyncHandler(UserController.updateProfile));
userRouter.delete("/profile", requireToken, asyncHandler(UserController.deleteAccount));
