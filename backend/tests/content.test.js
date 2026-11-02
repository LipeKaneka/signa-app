import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startTestApp, stopTestApp, registerTestUser, authorized } from "./helpers.js";

// Conteúdo público com cache por versão do conteúdo (Etapa 4) e os campos novos (nível, eventos).
const SERVER_SOURCE = "../../server/src";

let app;
let token;
let SignModel;
let EventModel;
let bumpContentVersion;
let clearEventsCache;

before(async () => {
  app = await startTestApp();
  ({ token } = await registerTestUser(app));
  ({ SignModel } = await import(`${SERVER_SOURCE}/models/model-sign.js`));
  ({ EventModel } = await import(`${SERVER_SOURCE}/models/model-event.js`));
  ({ bumpContentVersion } = await import(`${SERVER_SOURCE}/services/service-content-version.js`));
  ({ clearEventsCache } = await import(`${SERVER_SOURCE}/services/service-event.js`));
});

after(stopTestApp);

test("dicionário fica em cache até a versão do conteúdo mudar", async () => {
  const first = await request(app).get("/api/v1/dictionary/bom-dia").set(authorized(token));
  assert.equal(first.status, 200);
  const originalWord = first.body.sign.word;

  await SignModel.updateOne({ slug: "bom-dia" }, { word: "Bom dia (editado)" });
  const cached = await request(app).get("/api/v1/dictionary/bom-dia").set(authorized(token));
  assert.equal(cached.body.sign.word, originalWord);

  await bumpContentVersion();
  const refreshed = await request(app).get("/api/v1/dictionary/bom-dia").set(authorized(token));
  assert.equal(refreshed.body.sign.word, "Bom dia (editado)");

  await SignModel.updateOne({ slug: "bom-dia" }, { word: originalWord });
  await bumpContentVersion();
});

test("app-config sem login: textos públicos, níveis e versão", async () => {
  const response = await request(app).get("/api/v1/app-config");
  assert.equal(response.status, 200);
  assert.ok(response.body.settings["app.feedback.correctPhrases"].length > 0);
  assert.equal(response.body.levels[0].level, 1);
  assert.equal(typeof response.body.contentVersion, "number");
  assert.ok(!("progress.xpPerCorrectAnswer" in response.body.settings));
});

test("eventos ativos aparecem no app e o XP vem multiplicado", async () => {
  const now = Date.now();
  await EventModel.create({
    title: "Fim de semana 2x XP",
    type: "xp_multiplier",
    multiplier: 2,
    startsAt: new Date(now - 60_000),
    endsAt: new Date(now + 3_600_000),
  });
  clearEventsCache();
  await bumpContentVersion();

  const events = await request(app).get("/api/v1/events/active");
  assert.equal(events.status, 200);
  assert.equal(events.body.events[0].multiplier, 2);
  assert.equal(events.body.events[0].title, "Fim de semana 2x XP");

  const trail = await request(app).get("/api/v1/trail").set(authorized(token));
  const activityId = trail.body.modules[0].activities[0].id;
  const attempt = await request(app).post(`/api/v1/activities/${activityId}/attempts`).set(authorized(token));
  const question = attempt.body.activity.questions[0];
  const answer = await request(app)
    .post(`/api/v1/attempts/${attempt.body.attemptId}/answers`)
    .set(authorized(token))
    .send({ questionKey: question.key, optionId: question.options[0].id });
  assert.ok([0, 20].includes(answer.body.xpForQuestion));

  const finish = await request(app).post(`/api/v1/attempts/${attempt.body.attemptId}/finish`).set(authorized(token));
  assert.equal(finish.status, 200);
  assert.equal(finish.body.result.xpMultiplier, 2);
  assert.equal(typeof finish.body.user.level.level, "number");
});

test("perfil traz o nível calculado pelo XP", async () => {
  const response = await request(app).get("/api/v1/profile").set(authorized(token));
  assert.equal(response.status, 200);
  assert.equal(typeof response.body.user.level.title, "string");
  assert.ok("nextLevelXp" in response.body.user.level);
});
