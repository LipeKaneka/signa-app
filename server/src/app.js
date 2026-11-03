import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import { getEnvironment } from "./config/env.js";
import { internalRouter } from "./routes/route-internal.js";
import { adminRouter } from "./routes/route-admin.js";
import { notFoundHandler, errorHandler } from "./middlewares/error-middleware.js";

/** Build do painel (server/admin-panel → npm run build). */
const ADMIN_PANEL_DIRECTORY = fileURLToPath(new URL("../admin-panel/dist/", import.meta.url));

/**
 * Serve o painel web em /admin (arquivos do build). Sem build, /admin explica como gerar.
 * @param {import("express").Express} app
 */
function mountAdminPanel(app) {
  if (!existsSync(ADMIN_PANEL_DIRECTORY)) {
    app.get(["/admin", "/admin/"], (_req, res) => {
      res.status(503).type("text").send("Painel ainda não foi gerado. Rode: cd server/admin-panel && npm install && npm run build");
    });
    return;
  }
  // Os arquivos de assets/ têm hash no nome (podem ficar em cache); o index.html não, para cada build novo valer na hora.
  app.use(
    "/admin",
    express.static(ADMIN_PANEL_DIRECTORY, {
      index: "index.html",
      maxAge: "1h",
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
      },
    }),
  );
}

/**
 * Cria o app Express do servidor de gerenciamento:
 * - /internal/v1: API interna, só para o backend (chave de serviço);
 * - /admin/api/v1: API do painel (sessão de administrador em cookie);
 * - /admin: o painel web.
 * Sem CORS: nenhum outro site chama estas APIs pelo navegador. Não abre porta nem conecta ao banco.
 * @returns {import("express").Express}
 * Usado por: index.js e pelos testes.
 */
export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  // Atrás do proxy HTTPS da hospedagem: req.protocol vira "https" e req.ip o IP real (usados no painel e na auditoria).
  app.set("trust proxy", getEnvironment().trustProxy);
  app.use(helmet());
  app.use(express.json({ limit: "200kb" }));
  app.use("/internal/v1", internalRouter);
  app.use("/admin/api/v1", adminRouter);
  mountAdminPanel(app);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
