import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

// Testes de CONTRATO do app: chamam o backend como o APK chama, com um servidor de gerenciamento
// de verdade (pasta ../../server) rodando atrás, numa porta local, sobre um MongoDB em memória.
const SERVER_SOURCE = "../../server/src";

let memoryServer = null;
let managementServer = null;
let disconnectServerDatabase = null;

/**
 * Sobe MongoDB em memória + servidor de gerenciamento (com seed) e devolve o app do backend.
 * @returns {Promise<import("express").Express>}
 */
export async function startTestApp() {
  memoryServer = await MongoMemoryServer.create();
  const serviceKey = randomBytes(48).toString("hex");
  Object.assign(process.env, {
    NODE_ENV: "test",
    // Nunca envia e-mail de verdade nem fala com o Google nos testes (mesmo com essas chaves no server/.env).
    MAILTRAP_API_TOKEN: "",
    GOOGLE_CLIENT_IDS: "test-client.apps.googleusercontent.com",
    DATABASE_URL: memoryServer.getUri(),
    SERVICE_KEY: serviceKey,
    SERVER_SERVICE_KEY: serviceKey,
    JWT_SECRET: randomBytes(64).toString("hex"),
    FRONTEND_URL: "http://localhost:5173",
    ANTHROPIC_API_KEY: "",
    GEMINI_API_KEY: "",
    CONTENT_VERSION_TTL_MS: "0",
    // Os testes fazem centenas de chamadas seguidas do mesmo IP (atividades inteiras).
    API_RATE_LIMIT_PER_MINUTE: "5000",
  });

  const { connectDatabase, disconnectDatabase } = await import(`${SERVER_SOURCE}/database/database.js`);
  const { createApp: createServerApp } = await import(`${SERVER_SOURCE}/app.js`);
  const { seedContent } = await import(`${SERVER_SOURCE}/seeds/seed-content.js`);
  await connectDatabase(process.env.DATABASE_URL);
  await seedContent();
  disconnectServerDatabase = disconnectDatabase;

  managementServer = await new Promise((resolve) => {
    const listener = createServerApp().listen(0, "127.0.0.1", () => resolve(listener));
  });
  process.env.SERVER_URL = `http://127.0.0.1:${managementServer.address().port}/internal/v1`;

  const { createApp } = await import("../src/app.js");
  return createApp();
}

/** Derruba o servidor de gerenciamento, o banco em memória e a conexão. */
export async function stopTestApp() {
  await new Promise((resolve) => managementServer?.close(resolve));
  await disconnectServerDatabase?.();
  await memoryServer?.stop();
}

/**
 * Gabarito de uma atividade, lido direto do banco do servidor (só para os testes saberem a resposta certa).
 * @param {string} activityId
 * @returns {Promise<Map<string, string>>} questionKey -> correctOptionId
 */
export async function readCorrectOptions(activityId) {
  const { ActivityModel } = await import(`${SERVER_SOURCE}/models/model-activity.js`);
  const activity = await ActivityModel.findById(activityId).lean();
  return new Map(activity.questions.map((question) => [question.key, question.correctOptionId]));
}

let userCounter = 0;

/** Cria um usuário de teste com senha gerada na hora e devolve token + credenciais. */
export async function registerTestUser(app, overrides = {}) {
  userCounter += 1;
  const credentials = {
    nickname: `Teste ${userCounter}`,
    email: `teste${userCounter}_${randomBytes(3).toString("hex")}@exemplo.test`,
    password: `${randomBytes(6).toString("hex")}A1`,
    acceptedTerms: true,
    ...overrides,
  };
  const response = await request(app).post("/api/v1/auth/register").send(credentials);
  return { ...credentials, token: response.body.token, response };
}

export function authorized(token) {
  return { Authorization: `Bearer ${token}` };
}
