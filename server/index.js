import "dotenv/config";
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
async function startServer() {
  const environment = getEnvironment();
  await connectDatabase(environment.databaseUrl);

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
