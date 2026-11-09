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
  Object.assign(process.env, { NODE_ENV: "test", DATABASE_URL: memoryServer.getUri(), SERVICE_KEY: serviceKey, BREVO_API_KEY: "", MAILTRAP_API_TOKEN: "", GOOGLE_CLIENT_IDS: "" });

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

test("seed divide o Alfabeto antigo em duas partes sem perder o progresso (e pode rodar de novo)", async () => {
  const { ActivityModel } = await import("../src/models/model-activity.js");
  const { ModuleModel } = await import("../src/models/model-module.js");
  const { UserModel } = await import("../src/models/model-user.js");
  const { AttemptModel } = await import("../src/models/model-attempt.js");
  const { seedContent } = await import("../src/seeds/seed-content.js");
  const module = await ModuleModel.findOne({ slug: "alfabetizacao" }).lean();
  const before = await ActivityModel.find({ module: module._id }).sort({ order: 1 }).lean();
  assert.deepEqual(before.slice(0, 2).map((a) => [a.title, a.questions.length]), [["Alfabeto: parte 1", 13], ["Alfabeto: parte 2", 14]]);

  // Volta o banco ao formato antigo: uma atividade só, com 27 perguntas, e as seguintes uma ordem antes.
  const [first, second, ...rest] = before;
  await ActivityModel.deleteOne({ _id: second._id });
  for (const activity of rest) await ActivityModel.updateOne({ _id: activity._id }, { $set: { order: activity.order - 1 } });
  const oldQuestions = [...first.questions, ...second.questions.map((question, index) => ({ ...question, key: `q${14 + index}` }))];
  await ActivityModel.updateOne({ _id: first._id }, { $set: { title: "Alfabeto", questions: oldQuestions } });

  const finisher = await registerUser();
  const newcomer = await registerUser();
  await UserModel.updateOne({ _id: finisher.id }, {
    completedActivities: [{ activity: first._id, bestScore: 90 }, { activity: rest[0]._id, bestScore: 80 }],
    completedActivitiesCount: 2,
  });
  const attempt = await AttemptModel.create({ user: newcomer.id, activity: first._id, status: "in_progress", expiresAt: new Date(Date.now() + 3600000) });

  await seedContent();
  await seedContent(); // de novo: não muda nada

  const after = await ActivityModel.find({ module: module._id }).sort({ order: 1 }).lean();
  assert.equal(after.length, before.length);
  assert.deepEqual(after.map((a) => a.order), before.map((a) => a.order));
  assert.deepEqual(after.map((a) => a.title), before.map((a) => a.title));
  assert.equal(String(after[0]._id), String(first._id));
  assert.equal(after[0].questions.length, 13);
  assert.deepEqual(after[1].questions.map((q) => q.key).slice(0, 2), ["q1", "q2"]);
  assert.equal(after[1].questions.length, 14);

  const user = await UserModel.findById(finisher.id).lean();
  assert.equal(user.completedActivitiesCount, 3);
  assert.equal(user.completedActivities.find((c) => String(c.activity) === String(after[1]._id)).bestScore, 90);
  assert.equal((await UserModel.findById(newcomer.id).lean()).completedActivitiesCount, 0);
  assert.equal((await AttemptModel.findById(attempt._id).lean()).status, "expired");
  const trail = await request(app).get(`/internal/v1/users/${finisher.id}/trail`).set(withKey());
  assert.deepEqual(trail.body.modules[0].activities.slice(0, 4).map((a) => a.status), ["completed", "completed", "completed", "available"]);
});
