import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startTestApp, stopTestApp, registerTestUser, authorized, readCorrectOptions } from "./helpers.js";

let app;

before(async () => {
  app = await startTestApp();
});

after(stopTestApp);

/** Faz a atividade inteira acertando `correctCount` perguntas. */
async function playActivity(token, activityId, correctCount) {
  const started = await request(app).post(`/api/v1/activities/${activityId}/attempts`).set(authorized(token));
  assert.equal(started.status, 201);
  const correctOptions = await readCorrectOptions(activityId);

  for (const [index, question] of started.body.activity.questions.entries()) {
    const correctId = correctOptions.get(question.key);
    const optionId = index < correctCount ? correctId : question.options.find((o) => o.id !== correctId).id;
    const answer = await request(app).post(`/api/v1/attempts/${started.body.attemptId}/answers`)
      .set(authorized(token)).send({ questionKey: question.key, optionId });
    assert.equal(answer.status, 200);
  }
  return request(app).post(`/api/v1/attempts/${started.body.attemptId}/finish`).set(authorized(token));
}

/** Aprova todas as atividades de um módulo, na ordem. */
async function completeModule(token, module) {
  let last;
  for (const activity of module.activities) last = await playActivity(token, activity.id, activity.questionCount);
  return last;
}

async function readTrail(token) {
  const response = await request(app).get("/api/v1/trail").set(authorized(token));
  assert.equal(response.status, 200);
  return response.body.modules;
}

test("trilha nova: só a primeira atividade do primeiro módulo está liberada", async () => {
  const user = await registerTestUser(app);
  const modules = await readTrail(user.token);
  assert.equal(modules[0].status, "available");
  assert.equal(modules[0].activities[0].status, "available");
  assert.equal(modules[1].status, "locked");
  assert.equal(modules[1].activities[0].status, "locked");
});

test("perguntas chegam sem gabarito e com a glosa do avatar", async () => {
  const user = await registerTestUser(app);
  const [firstModule] = await readTrail(user.token);
  // A primeira unidade é de teoria (texto): sem gabarito e sem avatar.
  const theory = await request(app).post(`/api/v1/activities/${firstModule.activities[0].id}/attempts`).set(authorized(user.token));
  assert.ok(theory.body.activity.questions.every((q) => q.correctOptionId === undefined && q.avatar === null && q.explanation === undefined));

  // Unidade de sinais ("Alfabeto: parte 1"): libera marcando as anteriores e confere a glosa do avatar.
  const { UserModel } = await import("../../server/src/models/model-user.js");
  const { readUserIdFromToken } = await import("../src/utils/util-tokens.js");
  const signUnit = firstModule.activities.find((activity) => activity.title.startsWith("Alfabeto: parte 1"));
  const before = firstModule.activities.slice(0, firstModule.activities.indexOf(signUnit));
  await UserModel.updateOne({ _id: readUserIdFromToken(user.token) }, { $set: { completedActivities: before.map((unit) => ({ activity: unit.id, bestScore: 100 })) } });
  const started = await request(app).post(`/api/v1/activities/${signUnit.id}/attempts`).set(authorized(user.token));

  const [question] = started.body.activity.questions;
  assert.equal(question.correctOptionId, undefined);
  assert.equal(question.type, "sign_choice");
  assert.equal(question.options.length, 4);
  assert.ok(question.avatar.gloss);
  assert.equal(question.avatar.reviewed, false);
});

test("atividade bloqueada não pode ser iniciada", async () => {
  const user = await registerTestUser(app);
  const modules = await readTrail(user.token);
  const locked = await request(app).post(`/api/v1/activities/${modules[1].activities[0].id}/attempts`).set(authorized(user.token));
  assert.equal(locked.status, 403);
});

test("corrige no servidor, não aceita responder duas vezes e dá XP ao aprovar", async () => {
  const user = await registerTestUser(app);
  const [firstModule] = await readTrail(user.token);
  const activityId = firstModule.activities[0].id;

  const started = await request(app).post(`/api/v1/activities/${activityId}/attempts`).set(authorized(user.token));
  const correctOptions = await readCorrectOptions(activityId);
  const [question] = started.body.activity.questions;
  const answer = { questionKey: question.key, optionId: correctOptions.get(question.key) };

  const first = await request(app).post(`/api/v1/attempts/${started.body.attemptId}/answers`).set(authorized(user.token)).send(answer);
  assert.equal(first.body.correct, true);
  assert.equal(first.body.xpForQuestion, 10);

  const repeated = await request(app).post(`/api/v1/attempts/${started.body.attemptId}/answers`).set(authorized(user.token)).send(answer);
  assert.equal(repeated.status, 409);

  const total = firstModule.activities[0].questionCount;
  const finished = await playActivity(user.token, activityId, total);
  assert.equal(finished.status, 200);
  assert.equal(finished.body.result.score, 100);
  assert.equal(finished.body.result.passed, true);
  assert.equal(finished.body.result.xpEarned, total * 10 + 10);
  assert.equal(finished.body.user.streak, 1);
  assert.deepEqual(finished.body.result.newAchievements.map((a) => a.id), ["first_activity"]);

  // A conquista de módulo vem ao aprovar a última atividade do primeiro módulo.
  const moduleDone = await completeModule(user.token, { activities: firstModule.activities.slice(1) });
  assert.ok(moduleDone.body.result.newAchievements.some((a) => a.id === "first_module"));
});

test("reprovar não libera a próxima; aprovar libera o próximo módulo", async () => {
  const user = await registerTestUser(app);
  const [firstModule] = await readTrail(user.token);
  const activityId = firstModule.activities[0].id;

  const failed = await playActivity(user.token, activityId, 1);
  assert.equal(failed.body.result.passed, false);
  assert.equal(failed.body.result.xpEarned, 0);
  assert.equal((await readTrail(user.token))[1].status, "locked");

  await playActivity(user.token, activityId, firstModule.activities[0].questionCount);
  const halfway = await readTrail(user.token);
  assert.equal(halfway[0].status, "available");
  assert.equal(halfway[0].activities[1].status, "available");
  assert.equal(halfway[0].activities[2].status, "locked");
  assert.equal(halfway[1].status, "locked");

  await completeModule(user.token, { activities: firstModule.activities.slice(1) });
  const modules = await readTrail(user.token);
  assert.equal(modules[0].status, "completed");
  assert.equal(modules[1].status, "available");
  assert.equal(modules[1].activities[0].status, "available");
  assert.equal(modules[1].activities[1].status, "locked");
});

test("refazer atividade aprovada vale menos XP", async () => {
  const user = await registerTestUser(app);
  const [firstModule] = await readTrail(user.token);
  const { id, questionCount } = firstModule.activities[0];
  await playActivity(user.token, id, questionCount);
  const replay = await playActivity(user.token, id, questionCount);
  assert.equal(replay.body.result.xpEarned, questionCount * 2);
});

test("ranking ordena por atividades e mostra a posição do usuário", async () => {
  const leader = await registerTestUser(app);
  const [firstModule] = await readTrail(leader.token);
  await playActivity(leader.token, firstModule.activities[0].id, firstModule.activities[0].questionCount);
  const viewer = await registerTestUser(app);

  const ranking = await request(app).get("/api/v1/ranking?metric=activities").set(authorized(viewer.token));
  assert.equal(ranking.status, 200);
  const leaderRow = ranking.body.top.find((row) => row.publicId === leader.response.body.user.publicId);
  const viewerRow = ranking.body.top.find((row) => row.isMe);
  assert.ok(leaderRow.position < viewerRow.position);
  assert.equal(ranking.body.me.position, viewerRow.position);
  assert.ok(ranking.body.neighbors.some((row) => row.isMe));

  const invalid = await request(app).get("/api/v1/ranking?metric=senha").set(authorized(viewer.token));
  assert.equal(invalid.status, 400);
});

test("quem escolhe não aparecer some do ranking", async () => {
  const user = await registerTestUser(app);
  await request(app).patch("/api/v1/profile").set(authorized(user.token)).send({ showInRanking: false });
  const ranking = await request(app).get("/api/v1/ranking").set(authorized(user.token));
  assert.equal(ranking.body.me, null);
  assert.ok(!ranking.body.top.some((row) => row.isMe));
});

test("ranking informa quantas posições mudou e a melhor posição", async () => {
  const viewer = await registerTestUser(app);
  const [firstModule] = await readTrail(viewer.token);
  await playActivity(viewer.token, firstModule.activities[0].id, firstModule.activities[0].questionCount);

  const first = await request(app).get("/api/v1/ranking?metric=xp").set(authorized(viewer.token));
  assert.equal(first.body.me.positionChange, 0);
  assert.equal(first.body.me.bestPosition, first.body.me.position);

  // Duas pessoas novas passam na frente em XP
  for (let index = 0; index < 2; index += 1) {
    const rival = await registerTestUser(app);
    const [rivalModule] = await readTrail(rival.token);
    const rivalActivity = rivalModule.activities[0];
    await playActivity(rival.token, rivalActivity.id, rivalActivity.questionCount);
    await playActivity(rival.token, rivalActivity.id, rivalActivity.questionCount);
  }

  const second = await request(app).get("/api/v1/ranking?metric=xp").set(authorized(viewer.token));
  assert.equal(second.body.me.position, first.body.me.position + 2);
  assert.equal(second.body.me.positionChange, -2);
  assert.equal(second.body.me.bestPosition, first.body.me.position);
});

test("tentativa informa a ordem da atividade (título \"1. Alfabeto\")", async () => {
  const user = await registerTestUser(app);
  const [firstModule] = await readTrail(user.token);
  const started = await request(app).post(`/api/v1/activities/${firstModule.activities[0].id}/attempts`).set(authorized(user.token));
  assert.equal(started.body.activity.order, 1);
});
