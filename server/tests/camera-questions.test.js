import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

// Perguntas "Faça o sinal" (camera_sign): seed, validação do painel, o que vai para o app e a nota.
let app;
let memoryServer;
let serviceKey;
let disconnectDatabase;
let models;
let readQuestions;

before(async () => {
  memoryServer = await MongoMemoryServer.create();
  serviceKey = randomBytes(48).toString("hex");
  Object.assign(process.env, { NODE_ENV: "test", DATABASE_URL: memoryServer.getUri(), SERVICE_KEY: serviceKey, MAILTRAP_API_TOKEN: "", GOOGLE_CLIENT_IDS: "" });

  const database = await import("../src/database/database.js");
  const { seedContent } = await import("../src/seeds/seed-content.js");
  const { createApp } = await import("../src/app.js");
  await database.connectDatabase(process.env.DATABASE_URL);
  await seedContent();
  disconnectDatabase = database.disconnectDatabase;
  app = createApp();
  models = { ...(await import("../src/models/model-activity.js")), ...(await import("../src/models/model-module.js")) };
  ({ readQuestions } = await import("../src/services/service-admin-trail.js"));
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
    .send({ nickname: "Câmera", email: `camera_${randomBytes(3).toString("hex")}@exemplo.test`, password: `${randomBytes(6).toString("hex")}A1` });
  assert.equal(response.status, 201);
  return response.body.id;
}

test("seed cria as atividades de câmera no módulo Treino com a câmera", async () => {
  const module = await models.ModuleModel.findOne({ slug: "treino-com-a-camera" }).lean();
  const activities = await models.ActivityModel.find({ module: module._id }).lean();
  assert.equal(activities.length, 4);
  for (const activity of activities) {
    for (const question of activity.questions) {
      assert.equal(question.type, "camera_sign");
      assert.ok(question.target);
      assert.equal(question.correctOptionId, "done");
    }
  }
});

test("painel: alvo fora da lista é recusado; alvo válido ganha alternativas fixas", async () => {
  await assert.rejects(readQuestions([{ type: "camera_sign", prompt: "Faça", target: "H" }]), /câmera reconhece/);
  const [question] = await readQuestions([{ type: "camera_sign", prompt: "Faça o sinal", target: "banheiro" }]);
  assert.equal(question.target, "Banheiro");
  assert.deepEqual(question.options.map((option) => option.id), ["done", "skip"]);
  assert.equal(question.correctOptionId, "done");
});

test("tentativa: o app recebe o alvo sem gabarito; 'unavailable' não entra na nota", async () => {
  const module = await models.ModuleModel.create({ slug: `cam-${randomBytes(3).toString("hex")}`, title: "Câmera teste", level: 1, order: 99 });
  const questions = await readQuestions([
    { type: "camera_sign", prompt: "Faça A", target: "A" },
    { type: "camera_sign", prompt: "Faça E", target: "E" },
    { type: "camera_sign", prompt: "Faça Banheiro", target: "Banheiro" },
  ]);
  const activity = await models.ActivityModel.create({ module: module._id, order: 1, title: "Câmera", questions });
  const userId = await registerUser();

  const attempt = await request(app).post(`/internal/v1/users/${userId}/attempts`).set(withKey()).send({ activityId: String(activity._id) });
  assert.equal(attempt.status, 201);
  const [first, , third] = attempt.body.activity.questions;
  assert.equal(first.target, "A");
  assert.equal(first.targetKind, "letter");
  assert.equal(third.targetKind, "word");
  assert.equal(first.correctOptionId, undefined);

  const answer = (questionKey, optionId) =>
    request(app).post(`/internal/v1/users/${userId}/attempts/${attempt.body.attemptId}/answers`).set(withKey()).send({ questionKey, optionId });
  const done = await answer("q1", "done");
  assert.equal(done.body.correct, true);
  const skip = await answer("q2", "skip");
  assert.equal(skip.body.correct, false);
  const unavailable = await answer("q3", "unavailable");
  assert.equal(unavailable.status, 200);
  assert.equal(unavailable.body.skipped, true);

  const finish = await request(app).post(`/internal/v1/users/${userId}/attempts/${attempt.body.attemptId}/finish`).set(withKey());
  assert.equal(finish.status, 200);
  assert.equal(finish.body.result.totalQuestions, 2);
  assert.equal(finish.body.result.correctAnswers, 1);
  assert.equal(finish.body.result.score, 50);
});

test("'unavailable' só vale para pergunta de câmera", async () => {
  const userId = await registerUser();
  const trail = await request(app).get(`/internal/v1/users/${userId}/trail`).set(withKey());
  const activityId = trail.body.modules[0].activities[0].id;
  const attempt = await request(app).post(`/internal/v1/users/${userId}/attempts`).set(withKey()).send({ activityId });
  const key = attempt.body.activity.questions[0].key;
  const response = await request(app)
    .post(`/internal/v1/users/${userId}/attempts/${attempt.body.attemptId}/answers`)
    .set(withKey())
    .send({ questionKey: key, optionId: "unavailable" });
  assert.equal(response.status, 400);
});
