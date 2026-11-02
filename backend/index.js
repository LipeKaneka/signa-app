import "dotenv/config";
import { getEnvironment } from "./src/config/env.js";
import { createApp } from "./src/app.js";
import { callServer } from "./src/clients/server-client.js";

/**
 * Avisa no console se o servidor de gerenciamento não responde. Não impede o backend de subir:
 * enquanto o servidor estiver fora, o app recebe "Serviço temporariamente indisponível".
 * @returns {Promise<void>}
 */
async function reportServerConnection() {
  try {
    await callServer("/health");
    console.log(`Servidor de gerenciamento conectado (${getEnvironment().serverUrl}).`);
  } catch {
    console.warn(`Atenção: servidor de gerenciamento não respondeu em ${getEnvironment().serverUrl}.`);
  }
}

/**
 * Ponto de entrada do backend: valida o ambiente e sobe o Express. O backend não tem banco:
 * todos os dados vêm do servidor de gerenciamento (SERVER_URL).
 * @returns {Promise<void>}
 * Usado por: `npm start` / `npm run dev`.
 */
async function startServer() {
  const environment = getEnvironment();
  const server = createApp().listen(environment.port, () => {
    console.log(`API do Signa Ludus em http://localhost:${environment.port}/api/v1`);
    reportServerConnection();
  });

  function shutDown() {
    server.close(() => process.exit(0));
  }
  process.on("SIGINT", shutDown);
  process.on("SIGTERM", shutDown);
}

startServer().catch((error) => {
  console.error("Falha ao iniciar a API:", error.message);
  process.exit(1);
});
