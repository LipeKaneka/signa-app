import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

// Conquistas por ações no app (toques em ícones, dicionário, assistente...): POST /internal/v1/users/:id/events.
let app;
let memoryServer;
let serviceKey;
let disconnectDatabase;
let AchievementModel;
let SignModel;
let clearAchievementsCache;

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
  ({ AchievementModel } = await import("../src/models/model-achievement.js"));
  ({ SignModel } = await import("../src/models/model-sign.js"));
  ({ clearAchievementsCache } = await import("../src/services/service-achievement.js"));

  await AchievementModel.create([
    { key: "fogo_curioso", title: "Fogo curioso", description: "Toque 5 vezes no fogo.", metric: "tapFlame", goal: 5, order: 100 },
    { key: "explorador", title: "Explorador", description: "Abra 2 sinais no dicionário.", metric: "dictionarySignsViewed", goal: 2, order: 101 },
    { key: "enciclopedia", title: "Enciclopédia", description: "Veja o dicionário todo.", metric: "dictionaryPercent", goal: 100, order: 102, secret: true },
  ]);
  clearAchievementsCache();
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
    .send({ nickname: "Eventos", email: `eventos_${randomBytes(3).toString("hex")}@exemplo.test`, password: `${randomBytes(6).toString("hex")}A1`, acceptedTerms: true });
  assert.equal(response.status, 201);
  return response.body.id;
}

const sendEvents = (userId, events) => request(app).post(`/internal/v1/users/${userId}/events`).set(withKey()).send({ events });
const findAchievement = (profile, id) => profile.achievements.find((achievement) => achievement.id === id);

test("toques no fogo somam e desbloqueiam a conquista uma vez só", async () => {
  const userId = await registerUser();
  const first = await sendEvents(userId, [{ type: "tap_flame", count: 3 }]);
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.newAchievements, []);

  const second = await sendEvents(userId, [{ type: "tap_flame", count: 2 }, { type: "tap_logo" }]);
  assert.deepEqual(second.body.newAchievements.map((achievement) => achievement.id), ["fogo_curioso"]);

  const third = await sendEvents(userId, [{ type: "tap_flame" }]);
  assert.deepEqual(third.body.newAchievements, []);

  const profile = await request(app).get(`/internal/v1/users/${userId}/profile`).set(withKey());
  const achievement = findAchievement(profile.body, "fogo_curioso");
  assert.equal(achievement.unlocked, true);
  assert.ok(achievement.unlockedAt);
});

test("dicionário: cada sinal conta uma vez, sinais que não existem são ignorados", async () => {
  const userId = await registerUser();
  const [first, second] = await SignModel.find({ active: { $ne: false } }).sort({ slug: 1 }).limit(2).lean();

  const response = await sendEvents(userId, [
    { type: "sign_view", sign: first.slug },
    { type: "sign_view", sign: first.slug },
    { type: "sign_view", sign: "sinal-que-nao-existe" },
  ]);
  assert.deepEqual(response.body.newAchievements, []);

  const unlocked = await sendEvents(userId, [{ type: "sign_view", sign: second.slug }]);
  assert.deepEqual(unlocked.body.newAchievements.map((achievement) => achievement.id), ["explorador"]);

  const profile = await request(app).get(`/internal/v1/users/${userId}/profile`).set(withKey());
  assert.equal(findAchievement(profile.body, "explorador").current, 2);
  // Conquista secreta bloqueada continua escondida no app.
  assert.equal(findAchievement(profile.body, "enciclopedia").title, "Conquista secreta");
});

test("ver todos os sinais do dicionário desbloqueia a conquista de 100%", async () => {
  const userId = await registerUser();
  const slugs = await SignModel.distinct("slug", { active: { $ne: false } });
  let unlockedIds = [];
  for (let start = 0; start < slugs.length; start += 30) {
    const batch = slugs.slice(start, start + 30).map((sign) => ({ type: "sign_view", sign }));
    const response = await sendEvents(userId, batch);
    assert.equal(response.status, 200);
    unlockedIds = unlockedIds.concat(response.body.newAchievements.map((achievement) => achievement.id));
  }
  assert.ok(unlockedIds.includes("enciclopedia"));
});

test("formato inválido: 400; tipos desconhecidos são ignorados", async () => {
  const userId = await registerUser();
  assert.equal((await sendEvents(userId, [])).status, 400);
  assert.equal((await sendEvents(userId, "x")).status, 400);
  assert.equal((await sendEvents(userId, [{ type: "tap_flame", count: 51 }])).status, 400);
  assert.equal((await sendEvents(userId, [{ type: "tap_flame", count: 0 }])).status, 400);
  assert.equal((await sendEvents(userId, [{ type: "sign_view", sign: "../x" }])).status, 400);
  assert.equal((await sendEvents(userId, Array.from({ length: 31 }, () => ({ type: "tap_xp" })))).status, 400);
  const unknown = await sendEvents(userId, [{ type: "algo_novo", count: 3 }]);
  assert.equal(unknown.status, 200);
  assert.deepEqual(unknown.body.newAchievements, []);
});

test("sem chave de serviço: 401", async () => {
  const userId = await registerUser();
  const response = await request(app).post(`/internal/v1/users/${userId}/events`).send({ events: [{ type: "tap_xp" }] });
  assert.equal(response.status, 401);
});
