import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

// Proteção e regras da API interna do servidor de gerenciamento (o fluxo completo do app é testado
// pelos testes de contrato em backend/tests).
let app;
let memoryServer;
let serviceKey;
let disconnectDatabase;

before(async () => {
  memoryServer = await MongoMemoryServer.create();
  serviceKey = randomBytes(48).toString("hex");
  Object.assign(process.env, { NODE_ENV: "test", DATABASE_URL: memoryServer.getUri(), SERVICE_KEY: serviceKey });

  const database = await import("../src/database/database.js");
  const { seedContent } = await import("../src/seeds/seed-content.js");
  const { createApp } = await import("../src/app.js");
  await database.connectDatabase(process.env.DATABASE_URL);
  await seedContent();
  disconnectDatabase = database.disconnectDatabase;
  app = createApp();
});

after(async () => {
  await disconnectDatabase();
  await memoryServer.stop();
});

const withKey = () => ({ "X-Service-Key": serviceKey });

async function registerUser() {
  const response = await request(app)
    .post("/internal/v1/auth/register")
    .set(withKey())
    .send({ nickname: "Interno", email: `interno_${randomBytes(3).toString("hex")}@exemplo.test`, password: `${randomBytes(6).toString("hex")}A1`, acceptedTerms: true });
  assert.equal(response.status, 201);
  return response.body;
}

test("sem chave de serviço ou com chave errada: 401", async () => {
  const withoutKey = await request(app).get("/internal/v1/health");
  assert.equal(withoutKey.status, 401);

  const wrongKey = await request(app).get("/internal/v1/health").set({ "X-Service-Key": "x".repeat(96) });
  assert.equal(wrongKey.status, 401);

  const ok = await request(app).get("/internal/v1/health").set(withKey());
  assert.equal(ok.status, 200);
});

test("cadastro devolve o id interno e o perfil público (sem token nem hash)", async () => {
  const account = await registerUser();
  assert.match(account.id, /^[0-9a-f]{24}$/);
  assert.equal(account.token, undefined);
  assert.equal(account.user.passwordHash, undefined);
});

test("usuário inexistente: 401; id malformado: 400", async () => {
  const missing = await request(app).get("/internal/v1/users/0123456789abcdef01234567/session").set(withKey());
  assert.equal(missing.status, 401);

  const malformed = await request(app).get("/internal/v1/users/nao-e-id/session").set(withKey());
  assert.equal(malformed.status, 400);
});

test("cadastro guarda a data do aceite do Termo de Uso", async () => {
  const account = await registerUser();
  const { UserModel } = await import("../src/models/model-user.js");
  const stored = await UserModel.findById(account.id).lean();
  assert.ok(stored.termsAcceptedAt instanceof Date);
  assert.equal(account.user.termsAcceptedAt, undefined);
});

test("conta bloqueada: 403 em todas as rotas do usuário", async () => {
  const account = await registerUser();
  const { UserModel } = await import("../src/models/model-user.js");
  await UserModel.updateOne({ _id: account.id }, { status: "blocked" });

  const session = await request(app).get(`/internal/v1/users/${account.id}/session`).set(withKey());
  assert.equal(session.status, 403);
  const trail = await request(app).get(`/internal/v1/users/${account.id}/trail`).set(withKey());
  assert.equal(trail.status, 403);
});

test("perguntas saem do servidor sem gabarito", async () => {
  const account = await registerUser();
  const trail = await request(app).get(`/internal/v1/users/${account.id}/trail`).set(withKey());
  const activityId = trail.body.modules[0].activities[0].id;
  const attempt = await request(app).post(`/internal/v1/users/${account.id}/attempts`).set(withKey()).send({ activityId });
  assert.equal(attempt.status, 201);
  assert.ok(attempt.body.activity.questions.every((question) => question.correctOptionId === undefined));
});

test("perfil não aceita campos protegidos (xp, status)", async () => {
  const account = await registerUser();
  const response = await request(app).patch(`/internal/v1/users/${account.id}`).set(withKey()).send({ changes: { xp: 9999 } });
  assert.equal(response.status, 400);
});
