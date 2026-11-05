import { Router } from "express";
import * as AuthController from "../controllers/admin/controller-admin-auth.js";
import * as AccountsController from "../controllers/admin/controller-admin-accounts.js";
import * as TrailController from "../controllers/admin/controller-admin-trail.js";
import * as DictionaryController from "../controllers/admin/controller-admin-dictionary.js";
import * as GamificationController from "../controllers/admin/controller-admin-gamification.js";
import * as UsersController from "../controllers/admin/controller-admin-users.js";
import * as OverviewController from "../controllers/admin/controller-admin-overview.js";
import { requireAdminRequest, requireAdmin, requireRole } from "../middlewares/admin-auth-middleware.js";
import { PERMISSIONS } from "../config/admin-permissions.js";
import { asyncHandler } from "../utils/util-async-handler.js";
import { CAMERA_TARGETS } from "../config/camera-targets.js";

/**
 * API administrativa (/admin/api/v1): usada SOMENTE pelo painel web, servido pelo próprio servidor em /admin.
 * Sessão em cookie httpOnly + cabeçalho X-Signa-Admin (CSRF). Cada rota declara o papel mínimo
 * (PERMISSIONS em config/admin-permissions.js). Toda alteração entra na auditoria.
 */
export const adminRouter = Router();

const read = requireRole(PERMISSIONS.read);
const content = requireRole(PERMISSIONS.content);
const manage = requireRole(PERMISSIONS.manage);
const admins = requireRole(PERMISSIONS.admins);

adminRouter.use(requireAdminRequest);
adminRouter.post("/auth/login", asyncHandler(AuthController.login));

adminRouter.use(requireAdmin);
adminRouter.get("/auth/me", AuthController.me);
adminRouter.post("/auth/logout", asyncHandler(AuthController.logout));
adminRouter.post("/auth/password", asyncHandler(AuthController.changePassword));

adminRouter.get("/stats", read, asyncHandler(OverviewController.stats));
adminRouter.get("/analytics", read, asyncHandler(OverviewController.analytics));

adminRouter.get("/modules", read, asyncHandler(TrailController.listModules));
adminRouter.post("/modules", content, asyncHandler(TrailController.createModule));
adminRouter.post("/modules/reorder", content, asyncHandler(TrailController.reorderModules));
adminRouter.patch("/modules/:id", content, asyncHandler(TrailController.updateModule));
adminRouter.delete("/modules/:id", manage, asyncHandler(TrailController.deleteModule));
adminRouter.get("/modules/:id/activities", read, asyncHandler(TrailController.listActivities));
adminRouter.post("/modules/:id/activities/reorder", content, asyncHandler(TrailController.reorderActivities));
adminRouter.get("/activities/:id", read, asyncHandler(TrailController.getActivity));
adminRouter.post("/activities", content, asyncHandler(TrailController.createActivity));
adminRouter.patch("/activities/:id", content, asyncHandler(TrailController.updateActivity));
adminRouter.delete("/activities/:id", manage, asyncHandler(TrailController.deleteActivity));

// Sinais que o app confere pela câmera (alvos das perguntas "Faça o sinal").
adminRouter.get("/camera-targets", read, (_req, res) => res.json({ targets: CAMERA_TARGETS }));
adminRouter.get("/signs", read, asyncHandler(DictionaryController.list));
adminRouter.post("/signs", content, asyncHandler(DictionaryController.create));
adminRouter.patch("/signs/:slug", content, asyncHandler(DictionaryController.update));
adminRouter.delete("/signs/:slug", manage, asyncHandler(DictionaryController.remove));

adminRouter.get("/achievements", read, asyncHandler(GamificationController.listAchievements));
adminRouter.post("/achievements", content, asyncHandler(GamificationController.createAchievement));
adminRouter.patch("/achievements/:id", content, asyncHandler(GamificationController.updateAchievement));
adminRouter.delete("/achievements/:id", manage, asyncHandler(GamificationController.deleteAchievement));

adminRouter.get("/events", read, asyncHandler(GamificationController.listEvents));
adminRouter.post("/events", manage, asyncHandler(GamificationController.createEvent));
adminRouter.patch("/events/:id", manage, asyncHandler(GamificationController.updateEvent));
adminRouter.post("/events/:id/end", manage, asyncHandler(GamificationController.endEvent));
adminRouter.delete("/events/:id", manage, asyncHandler(GamificationController.deleteEvent));

adminRouter.get("/levels", read, asyncHandler(GamificationController.listLevels));
adminRouter.put("/levels", manage, asyncHandler(GamificationController.replaceLevels));

adminRouter.get("/settings", read, asyncHandler(GamificationController.listSettings));
adminRouter.put("/settings/:key", manage, asyncHandler(GamificationController.updateSetting));
adminRouter.delete("/settings/:key", manage, asyncHandler(GamificationController.resetSetting));

adminRouter.get("/users", read, asyncHandler(UsersController.list));
adminRouter.get("/users/:id", read, asyncHandler(UsersController.detail));
adminRouter.patch("/users/:id/status", manage, asyncHandler(UsersController.setStatus));
adminRouter.post("/users/:id/xp", manage, asyncHandler(UsersController.adjustXp));
adminRouter.post("/users/:id/reset-progress", manage, asyncHandler(UsersController.resetProgress));

adminRouter.get("/audit-log", manage, asyncHandler(OverviewController.auditLog));
adminRouter.get("/database/export", manage, asyncHandler(OverviewController.exportDatabase));
adminRouter.post("/database/seed", manage, asyncHandler(OverviewController.runSeed));

adminRouter.get("/admins", admins, asyncHandler(AccountsController.list));
adminRouter.post("/admins", admins, asyncHandler(AccountsController.create));
adminRouter.patch("/admins/:id", admins, asyncHandler(AccountsController.update));
adminRouter.post("/admins/:id/password", admins, asyncHandler(AccountsController.resetPassword));
