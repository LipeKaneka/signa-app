// MongoDB local para desenvolvimento, sem instalar nada: usa o binário do mongodb-memory-server,
// mas grava os dados em disco (server/.data), então contas e progresso sobrevivem a reinícios.
// Uso: npm run db:local  (deixe rodando; Ctrl+C para parar)
import { mkdir } from "node:fs/promises";
import { MongoMemoryServer } from "mongodb-memory-server";

const PORT = Number(process.env.LOCAL_DB_PORT ?? 27017);
const DATA_DIRECTORY = new URL("../.data/", import.meta.url);

async function startLocalDatabase() {
  await mkdir(DATA_DIRECTORY, { recursive: true });
  const server = await MongoMemoryServer.create({
    instance: {
      port: PORT,
      dbPath: decodeURIComponent(DATA_DIRECTORY.pathname).replace(/^\/([A-Za-z]:)/, "$1"),
      storageEngine: "wiredTiger",
    },
  });
  console.log(`MongoDB local em mongodb://localhost:${PORT} (dados em server/.data)`);

  async function stop() {
    await server.stop({ doCleanup: false });
    process.exit(0);
  }
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

startLocalDatabase().catch((error) => {
  console.error("Não foi possível iniciar o MongoDB local:", error.message);
  process.exit(1);
});
