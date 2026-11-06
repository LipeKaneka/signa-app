import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

// Etapa 4: conquistas, eventos de XP, níveis e regras vindos do banco (com o código como padrão).
let app;
let memoryServer;
let serviceKey;
let disconnectDatabase;
let models;
let services;

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

  models = {
    ...(await import("../src/models/model-activity.js")),
    ...(await import("../src/models/model-achievement.js")),
    ...(await import("../src/models/model-event.js")),
    ...(await import("../src/models/model-level.js")),
    ...(await import("../src/models/model-setting.js")),
  };
  services = {
    ...(await import("../src/services/service-settings.js")),
    ...(await import("../src/services/service-event.js")),
    ...(await import("../src/services/service-achievement.js")),
    ...(await import("../src/services/service-level.js")),
    seedContent,
  };
});

after(async () => {
  await disconnectDatabase();
  await memoryServer.stop();
});

// Cada teste começa sem eventos nem configurações trocadas (a versão do conteúdo fica).
beforeEach(async () => {
  await models.EventModel.deleteMany({});
  await models.SettingModel.deleteMany({ key: { $ne: "content.version" } });
  services.clearEventsCache();
  services.clearSettingsCache();
});

const withKey = () => ({ "X-Service-Key": serviceKey });

async function registerUser() {
  const response = await request(app)
    .post("/internal/v1/auth/register")
    .set(withKey())
    .send({ nickname: "Regras", email: `regras_${randomBytes(3).toString("hex")}@exemplo.test`, password: `${randomBytes(6).toString("hex")}A1` });
  assert.equal(response.status, 201);
  return response.body.id;
}

/** Faz a primeira atividade acertando tudo; devolve a última correção e o fim. */
async function playFirstActivityPerfectly(userId) {
  const trail = await request(app).get(`/internal/v1/users/${userId}/trail`).set(withKey());
  const activityId = trail.body.modules[0].activities[0].id;
  const activity = await models.ActivityModel.findById(activityId).lean();
  const attempt = await request(app).post(`/internal/v1/users/${userId}/attempts`).set(withKey()).send({ activityId });
  let lastAnswer;
  for (const question of activity.questions) {
    lastAnswer = await request(app)
      .post(`/internal/v1/users/${userId}/attempts/${attempt.body.attemptId}/answers`)
      .set(withKey())
      .send({ questionKey: question.key, optionId: question.correctOptionId });
  }
  const finish = await request(app).post(`/internal/v1/users/${userId}/attempts/${attempt.body.attemptId}/finish`).set(withKey());
  assert.equal(finish.status, 200);
  return { answer: lastAnswer.body, finish: finish.body, questions: activity.questions.length };
}

function createXpEvent(multiplier, overrides = {}) {
  const now = Date.now();
  return models.EventModel.create({
    title: `${multiplier}x XP`,
    type: "xp_multiplier",
    multiplier,
    startsAt: new Date(now - 60_000),
    endsAt: new Date(now + 3_600_000),
    active: true,
    ...overrides,
  });
}

test("sem evento: XP padrão e multiplicador 1", async () => {
  const { answer, finish, questions } = await playFirstActivityPerfectly(await registerUser());
  assert.equal(answer.xpForQuestion, 10);
  assert.equal(finish.result.xpMultiplier, 1);
  assert.equal(finish.result.xpEarned, questions * 10 + 10);
});

test("evento de 2x XP dobra o XP; o maior multiplicador vence e eventos não se somam", async () => {
  await createXpEvent(2);
  await createXpEvent(3);
  await createXpEvent(5, { active: false });
  await createXpEvent(4, { startsAt: new Date(Date.now() + 3_600_000), endsAt: new Date(Date.now() + 7_200_000) });

  const { answer, finish, questions } = await playFirstActivityPerfectly(await registerUser());
  assert.equal(answer.xpForQuestion, 30);
  assert.equal(finish.result.xpMultiplier, 3);
  assert.equal(finish.result.xpEarned, (questions * 10 + 10) * 3);
  assert.equal(finish.user.xp, finish.result.xpEarned);

  const events = await request(app).get("/internal/v1/events/active").set(withKey());
  assert.equal(events.status, 200);
  assert.deepEqual(events.body.events.map((event) => event.multiplier).sort(), [2, 3]);
});

test("regra trocada no banco muda o XP; valor inválido é recusado", async () => {
  await services.setSetting("progress.xpPerCorrectAnswer", 15);
  await services.setSetting("progress.perfectActivityBonusXp", 0);
  const { finish, questions } = await playFirstActivityPerfectly(await registerUser());
  assert.equal(finish.result.xpEarned, questions * 15);

  await assert.rejects(services.setSetting("progress.xpPerCorrectAnswer", -1), { status: 400 });
  await assert.rejects(services.setSetting("nao.existe", 1), { status: 400 });
});

test("conquista criada no banco aparece; desativada some", async () => {
  await models.AchievementModel.create({
    key: "teste_xp_1",
    title: "Primeiro XP",
    description: "Ganhe 1 XP.",
    metric: "xp",
    goal: 1,
    order: 99,
  });
  await models.AchievementModel.updateOne({ key: "streak_7" }, { active: false });
  services.clearAchievementsCache();

  const userId = await registerUser();
  const { finish } = await playFirstActivityPerfectly(userId);
  assert.ok(finish.result.newAchievements.some((achievement) => achievement.id === "teste_xp_1"));

  const profile = await request(app).get(`/internal/v1/users/${userId}/profile`).set(withKey());
  const ids = profile.body.achievements.map((achievement) => achievement.id);
  assert.ok(ids.includes("teste_xp_1"));
  assert.ok(!ids.includes("streak_7"));
});

test("nível sai no perfil e no fim da atividade, calculado pela tabela do banco", async () => {
  const userId = await registerUser();
  const profile = await request(app).get(`/internal/v1/users/${userId}/profile`).set(withKey());
  assert.deepEqual(profile.body.user.level, { level: 1, title: "Iniciante", minXp: 0, nextLevelXp: 100 });

  await models.LevelModel.updateOne({ level: 2 }, { minXp: 10, title: "Começando" });
  services.clearLevelsCache();
  const { finish } = await playFirstActivityPerfectly(userId);
  assert.equal(finish.user.level.level, 2);
  assert.equal(finish.user.level.title, "Começando");
});

test("app-config traz textos públicos, níveis e versão; regras internas ficam de fora", async () => {
  const defaults = await request(app).get("/internal/v1/app-config").set(withKey());
  assert.ok(defaults.body.settings["app.feedback.wrongPhrases"].length >= 10);
  await services.setSetting("app.feedback.correctPhrases", [{ title: "Mandou bem!", text: "" }]);
  const response = await request(app).get("/internal/v1/app-config").set(withKey());
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.settings["app.feedback.correctPhrases"], [{ title: "Mandou bem!", text: "" }]);
  assert.ok("progress.minScoreToPass" in response.body.settings);
  assert.ok(!("progress.xpPerCorrectAnswer" in response.body.settings));
  assert.ok(response.body.levels.length >= 1);
  assert.equal(typeof response.body.contentVersion, "number");
});

test("versão do conteúdo só cresce; rodar o seed de novo não desfaz edições do painel", async () => {
  const before = (await request(app).get("/internal/v1/content/version").set(withKey())).body.version;
  await models.AchievementModel.updateOne({ key: "first_activity" }, { title: "Editada no painel" });

  await services.seedContent();
  const after = (await request(app).get("/internal/v1/content/version").set(withKey())).body.version;
  assert.equal(after, before + 1);
  const edited = await models.AchievementModel.findOne({ key: "first_activity" }).lean();
  assert.equal(edited.title, "Editada no painel");
});

test("unidade com sorteio: cada tentativa traz só as perguntas sorteadas e a nota vale sobre elas", async () => {
  const userId = await registerUser();
  await playFirstActivityPerfectly(userId);
  const trail = await request(app).get(`/internal/v1/users/${userId}/trail`).set(withKey());
  const drawn = trail.body.modules[0].activities[1];
  const activity = await models.ActivityModel.findById(drawn.id).lean();
  assert.ok(activity.questionsPerAttempt < activity.questions.length);
  assert.equal(drawn.questionCount, activity.questionsPerAttempt);

  const attempt = await request(app).post(`/internal/v1/users/${userId}/attempts`).set(withKey()).send({ activityId: drawn.id });
  const keys = attempt.body.activity.questions.map((question) => question.key);
  assert.equal(keys.length, activity.questionsPerAttempt);
  assert.equal(new Set(keys).size, keys.length);

  const notDrawn = activity.questions.find((question) => !keys.includes(question.key));
  const outside = await request(app)
    .post(`/internal/v1/users/${userId}/attempts/${attempt.body.attemptId}/answers`)
    .set(withKey())
    .send({ questionKey: notDrawn.key, optionId: notDrawn.correctOptionId });
  assert.equal(outside.status, 400);

  for (const key of keys) {
    const question = activity.questions.find((item) => item.key === key);
    await request(app)
      .post(`/internal/v1/users/${userId}/attempts/${attempt.body.attemptId}/answers`)
      .set(withKey())
      .send({ questionKey: key, optionId: question.correctOptionId });
  }
  const finish = await request(app).post(`/internal/v1/users/${userId}/attempts/${attempt.body.attemptId}/finish`).set(withKey());
  assert.equal(finish.body.result.totalQuestions, activity.questionsPerAttempt);
  assert.equal(finish.body.result.score, 100);
});

test("conquista desbloqueada guarda a data; bloqueada vem sem data", async () => {
  const userId = await registerUser();
  const before = Date.now();
  await playFirstActivityPerfectly(userId);
  const profile = await request(app).get(`/internal/v1/users/${userId}/profile`).set(withKey());
  const first = profile.body.achievements.find((achievement) => achievement.id === "first_activity");
  assert.equal(first.unlocked, true);
  assert.ok(new Date(first.unlockedAt).getTime() >= before - 1000);
  const locked = profile.body.achievements.find((achievement) => !achievement.unlocked);
  assert.equal(locked.unlockedAt, null);

  const again = await request(app).get(`/internal/v1/users/${userId}/profile`).set(withKey());
  assert.equal(again.body.achievements.find((achievement) => achievement.id === "first_activity").unlockedAt, first.unlockedAt);
});
