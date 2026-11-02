import { Router } from "express";
import * as DictionaryController from "../controllers/controller-dictionary.js";
import { requireAuth } from "../middlewares/auth-middleware.js";
import { asyncHandler } from "../utils/util-async-handler.js";

export const dictionaryRouter = Router();

dictionaryRouter.use("/dictionary", requireAuth);
dictionaryRouter.get("/dictionary", asyncHandler(DictionaryController.listSigns));
dictionaryRouter.get("/dictionary/categories", asyncHandler(DictionaryController.listCategories));
dictionaryRouter.get("/dictionary/:slug", asyncHandler(DictionaryController.getSign));
