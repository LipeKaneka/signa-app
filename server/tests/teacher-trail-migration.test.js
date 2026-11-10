import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

// Banco com a trilha ANTIGA (como o que está em produção) → seed → trilha para professores, sem perder progresso.
let app;
let memoryServer;
let serviceKey;
let disconnectDatabase;
let models;
let seedContent;
const old = {};

const question = (key) => ({ key, type: "true_false", prompt: "Pergunta", options: [{ id: "a", text: "Verdadeiro" }, { id: "b", text: "Falso" }], correctOptionId: "a" });

before(async () => {
  memoryServer = await MongoMemoryServer.create();
  serviceKey = randomBytes(48).toString("hex");
  Object.assign(process.env, { NODE_ENV: "test", DATABASE_URL: memoryServer.getUri(), SERVICE_KEY: serviceKey, BREVO_API_KEY: "", MAILTRAP_API_TOKEN: "", GOOGLE_CLIENT_IDS: "" });
  const database = await import("../src/database/database.js");
  ({ seedContent } = await import("../src/seeds/seed-content.js"));
  const { createApp } = await import("../src/app.js");
  models = {
    ...(await import("../src/models/model-module.js")),
    ...(await import("../src/models/model-activity.js")),
    ...(await import("../src/models/model-user.js")),
  };
  await database.connectDatabase(process.env.DATABASE_URL);
  disconnectDatabase = database.disconnectDatabase;
  app = createApp();

  // Trilha antiga: Alfabetização (8 unidades), Algumas palavrinhas, Treino com a câmera e um módulo criado no painel.
  old.alphabet = await models.ModuleModel.create({ slug: "alfabetizacao", title: "Alfabetização", level: 1, order: 1 });
  old.words = await models.ModuleModel.create({ slug: "algumas-palavrinhas", title: "Algumas palavrinhas", level: 1, order: 2, prerequisite: old.alphabet._id });
  old.camera = await models.ModuleModel.create({ slug: "treino-com-a-camera", title: "Treino com a câmera", level: 1, order: 3, prerequisite: old.words._id });
  old.panel = await models.ModuleModel.create({ slug: "teste", title: "Teste", level: 1, order: 4 });
  const titles = ["Alfabeto: parte 1", "Alfabeto: parte 2", "Letras aleatórias: A a M", "Letras aleatórias: N a Z", "Vogais", "Consoantes", "Números", "Revisão"];
  old.units = {};
  for (const [index, title] of titles.entries()) {
    old.units[title] = await models.ActivityModel.create({ module: old.alphabet._id, order: index + 1, title, questions: [question("q1")] });
  }
  old.colors = await models.ActivityModel.create({ module: old.words._id, order: 1, title: "Cores", questions: [question("q1")] });
});

after(async () => {
  await disconnectDatabase();
  await memoryServer.stop();
});

test("seed leva o banco antigo para a trilha de professores, mantendo progresso (e pode rodar de novo)", async () => {
  const register = await request(app).post("/internal/v1/auth/register").set({ "X-Service-Key": serviceKey })
    .send({ nickname: "Profe", email: `profe_${randomBytes(3).toString("hex")}@exemplo.test`, password: `${randomBytes(6).toString("hex")}A1`, acceptedTerms: true });
  const userId = register.body.id;
  const done = Object.values(old.units).map((unit) => ({ activity: unit._id, bestScore: 90 }));
  await models.UserModel.updateOne({ _id: userId }, { $set: { completedActivities: [...done, { activity: old.colors._id, bestScore: 80 }], completedActivitiesCount: done.length + 1 } });

  await seedContent();
  await seedContent(); // de novo: nada muda nem duplica

  const active = await models.ModuleModel.find({ active: { $ne: false } }).sort({ order: 1 }).lean();
  assert.deepEqual(active.map((module) => module.slug), ["fundamentos", "rotina-sala-de-aula", "interacao-pedagogica", "conflitos-e-inclusao", "pratica-contextualizada"]);
  assert.equal(String(active[0]._id), String(old.alphabet._id)); // mesmo documento, renomeado
  for (const slug of ["algumas-palavrinhas", "treino-com-a-camera", "teste"]) {
    assert.equal((await models.ModuleModel.findOne({ slug }).lean()).active, false);
  }
  for (const [index, module] of active.entries()) {
    assert.equal(String(module.prerequisite ?? null), index === 0 ? "null" : String(active[index - 1]._id));
  }

  const first = await models.ActivityModel.find({ module: old.alphabet._id, active: { $ne: false } }).sort({ order: 1 }).lean();
  assert.deepEqual(first.map((unit) => unit.title), [
    "Libras e cultura surda", "Os 5 parâmetros", "Alfabeto: parte 1", "Alfabeto: parte 2", "Letras aleatórias: A a M",
    "Letras aleatórias: N a Z", "Alfabeto na câmera", "Saudações e apresentações", "Revisão do módulo",
  ]);
  assert.equal(String(first[2]._id), String(old.units["Alfabeto: parte 1"]._id));
  for (const title of ["Vogais", "Consoantes", "Revisão"]) {
    assert.equal((await models.ActivityModel.findById(old.units[title]._id).lean()).active, false);
  }
  const numbers = await models.ActivityModel.findById(old.units["Números"]._id).lean();
  assert.equal(String(numbers.module), String(active[2]._id));
  assert.equal(numbers.order, 1);
  assert.equal(numbers.title, "Números de 0 a 10");
  assert.equal(await models.ActivityModel.countDocuments({ module: active[2]._id }), 6); // sem "Números" duplicado

  const trail = await request(app).get(`/internal/v1/users/${userId}/trail`).set({ "X-Service-Key": serviceKey });
  const fundamentals = trail.body.modules[0].activities;
  assert.equal(trail.body.modules.length, 5);
  assert.deepEqual(fundamentals.slice(0, 6).map((unit) => unit.status), ["available", "locked", "completed", "completed", "completed", "completed"]);
  assert.equal(trail.body.modules[1].status, "locked"); // precisa terminar as unidades novas do módulo 1
});
