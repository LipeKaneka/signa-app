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

/** De quanto em quanto tempo o backend "cutuca" o servidor para ele não dormir (hospedagem grátis dorme em ~15 min). */
const KEEP_SERVER_AWAKE_MS = 10 * 60 * 1000;

/**
 * Enquanto o backend estiver no ar, pede /health ao servidor a cada 10 min: assim, quando o app acorda o backend,
 * o servidor acorda junto (na subida) e não volta a dormir enquanto o backend está em uso.
 */
function keepServerAwake() {
  setInterval(() => callServer("/health").catch(() => {}), KEEP_SERVER_AWAKE_MS).unref();
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
    if (environment.nodeEnv === "production") keepServerAwake();
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
