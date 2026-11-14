import { Router } from "express";
import * as UserController from "../controllers/controller-internal-user.js";
import * as ProgressController from "../controllers/controller-internal-progress.js";
import * as DictionaryController from "../controllers/controller-internal-dictionary.js";
import * as ContentController from "../controllers/controller-internal-content.js";
import * as NotificationController from "../controllers/controller-internal-notification.js";
import { requireServiceKey } from "../middlewares/service-auth-middleware.js";
import { loadUser } from "../middlewares/load-user-middleware.js";
import { asyncHandler } from "../utils/util-async-handler.js";

/**
 * API interna (/internal/v1): usada SOMENTE pelo backend, com a chave de serviço.
 * Rotas de usuário recebem o id interno em :userId (o backend tira do token do app).
 * Lista e formatos: docs/ARQUITETURA-PROPOSTA.md (seção 6.2).
 */
export const internalRouter = Router();

internalRouter.use(requireServiceKey);
internalRouter.get("/health", (_req, res) => res.json({ status: "ok" }));
internalRouter.get("/notifications/stream", NotificationController.streamNotifications);

internalRouter.post("/auth/register", asyncHandler(UserController.register));
internalRouter.post("/auth/verify-credentials", asyncHandler(UserController.verifyCredentials));
internalRouter.post("/auth/google", asyncHandler(UserController.googleSignIn));
internalRouter.post("/auth/password-reset/request", asyncHandler(UserController.requestPasswordReset));
internalRouter.post("/auth/password-reset/verify", asyncHandler(UserController.verifyPasswordReset));
internalRouter.post("/auth/password-reset/confirm", asyncHandler(UserController.confirmPasswordReset));

const userRoutes = Router({ mergeParams: true });
userRoutes.use(loadUser);
userRoutes.get("/session", UserController.getSession);
userRoutes.get("/profile", asyncHandler(UserController.getProfile));
userRoutes.post("/events", asyncHandler(UserController.recordEvents));
userRoutes.patch("/", asyncHandler(UserController.updateProfile));
userRoutes.delete("/", asyncHandler(UserController.deleteUser));
userRoutes.get("/notifications", asyncHandler(NotificationController.list));
userRoutes.post("/notifications/read", asyncHandler(NotificationController.markRead));
userRoutes.get("/trail", asyncHandler(ProgressController.getTrail));
userRoutes.post("/attempts", asyncHandler(ProgressController.startAttempt));
userRoutes.post("/attempts/:attemptId/answers", asyncHandler(ProgressController.answerQuestion));
userRoutes.post("/attempts/:attemptId/finish", asyncHandler(ProgressController.finishAttempt));
userRoutes.get("/ranking", asyncHandler(ProgressController.getRanking));
internalRouter.use("/users/:userId", userRoutes);

internalRouter.get("/dictionary", asyncHandler(DictionaryController.listSigns));
internalRouter.get("/dictionary/categories", asyncHandler(DictionaryController.listCategories));
internalRouter.get("/dictionary/mentioned", asyncHandler(DictionaryController.findMentioned));
internalRouter.get("/dictionary/signs/:slug", asyncHandler(DictionaryController.getSign));

internalRouter.get("/content/version", asyncHandler(ContentController.getVersion));
internalRouter.get("/events/active", asyncHandler(ContentController.listActiveEvents));
internalRouter.get("/app-config", asyncHandler(ContentController.getAppConfig));
