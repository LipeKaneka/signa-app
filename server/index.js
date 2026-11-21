import "dotenv/config";
import mongoose from "mongoose";
import { getEnvironment } from "./src/config/env.js";
import { connectDatabase, disconnectDatabase } from "./src/database/database.js";
import { createApp } from "./src/app.js";
import { startNotificationScheduler, stopNotificationScheduler } from "./src/services/service-notification-scheduler.js";

/**
 * Ponto de entrada do servidor de gerenciamento: valida o ambiente, conecta ao MongoDB e escuta em HOST:PORT
 * (padrão 127.0.0.1:8090 — inacessível de fora da máquina).
 * @returns {Promise<void>}
 * Usado por: `npm start` / `npm run dev`.
 */
/** Espera entre tentativas de conectar ao banco (cresce até o máximo). */
const DATABASE_RETRY_MIN_MS = 2000;
const DATABASE_RETRY_MAX_MS = 15000;

/**
 * Conecta ao banco tentando de novo até conseguir. Antes, se o banco ainda não estivesse no ar (ex.: o MongoDB
 * local subindo junto, ou fora do ar), o servidor saía com ECONNREFUSED e o "node --watch" ficava parado esperando
 * mudança em arquivo. Depois de conectado, o próprio driver reconecta sozinho se a conexão cair.
 * @param {string} databaseUrl
 * @returns {Promise<void>}
 */
async function connectWithRetry(databaseUrl) {
  let delay = DATABASE_RETRY_MIN_MS;
  for (let attempt = 1; ; attempt += 1) {
    try {
      await connectDatabase(databaseUrl);
      if (attempt > 1) console.log("Banco de dados conectado.");
      return;
    } catch (error) {
      console.error(`Banco de dados indisponível (tentativa ${attempt}): ${error.message}. Tentando de novo em ${delay / 1000} s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, DATABASE_RETRY_MAX_MS);
    }
  }
}

async function startServer() {
  const environment = getEnvironment();
  await connectWithRetry(environment.databaseUrl);
  mongoose.connection.on("disconnected", () => console.error("Conexão com o banco caiu; reconectando..."));
  mongoose.connection.on("reconnected", () => console.log("Banco de dados reconectado."));

  const server = createApp().listen(environment.port, environment.host, () => {
    console.log(`Servidor de gerenciamento em http://${environment.host}:${environment.port}/internal/v1`);
  });
  startNotificationScheduler();

  async function shutDown() {
    stopNotificationScheduler();
    server.close();
    await disconnectDatabase();
    process.exit(0);
  }
  process.on("SIGINT", shutDown);
  process.on("SIGTERM", shutDown);
}

startServer().catch((error) => {
  console.error("Falha ao iniciar o servidor de gerenciamento:", error.message);
  process.exit(1);
});
