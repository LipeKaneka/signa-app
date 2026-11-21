import mongoose from "mongoose";

/**
 * Conecta o Mongoose ao MongoDB.
 * @param {string} databaseUrl - ex.: mongodb://localhost:27017/signa-ludus
 * @returns {Promise<import("mongoose").Connection>}
 * Usado por: index.js, seeds/seed-content.js e tests/helpers.js.
 */
export async function connectDatabase(databaseUrl) {
  mongoose.set("strictQuery", true);
  // 10 s (o padrão é 30): com o banco fora do ar, a tentativa falha logo e o index.js tenta de novo.
  await mongoose.connect(databaseUrl, { serverSelectionTimeoutMS: 10000 });
  return mongoose.connection;
}

/**
 * Fecha a conexão com o MongoDB (desligamento e fim do seed).
 * @returns {Promise<void>}
 */
export async function disconnectDatabase() {
  await mongoose.disconnect();
}
