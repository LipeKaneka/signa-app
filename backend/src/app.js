import express from "express";
import helmet from "helmet";
import cors from "cors";
import { getEnvironment } from "./config/env.js";
import { apiRouter } from "./routes/index.js";
import { apiLimiter } from "./middlewares/rateLimit-middleware.js";
import { notFoundHandler, errorHandler } from "./middlewares/error-middleware.js";

/**
 * Monta as regras de CORS: só as origens de FRONTEND_URL podem chamar a API pelo navegador.
 * Requisições sem cabeçalho Origin (app nativo, curl, testes) são aceitas.
 * @param {string[]} allowedOrigins - origens permitidas (ex.: "http://localhost:5173", "https://localhost").
 * @returns {import("cors").CorsOptions}
 */
function buildCorsOptions(allowedOrigins) {
  return {
    origin(origin, callback) {
      const allowed = !origin || allowedOrigins.includes(origin);
      callback(null, allowed);
    },
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  };
}

/**
 * Cria o app Express com segurança (helmet, CORS, limite de JSON e de requisições),
 * todas as rotas em /api/v1 e o tratamento de erros. Não abre porta nem conecta ao banco.
 * @returns {import("express").Express}
 * Usado por: index.js (servidor real) e tests/helpers.js (testes com supertest).
 */
export function createApp() {
  const { frontendOrigins } = getEnvironment();
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors(buildCorsOptions(frontendOrigins)));
  app.use(express.json({ limit: "100kb" }));
  app.use("/api/v1", apiLimiter, apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
