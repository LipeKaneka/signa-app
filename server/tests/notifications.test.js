import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

// Notificações: tipos do painel, envio manual, histórico, tempo real (SSE),
// eventos que começam e lembrete de ofensiva.
let app;
let memoryServer;
let serviceKey;
let disconnectDatabase;
let Notifications;
let Scheduler;
let EventModel;
let UserModel;
const PANEL = { "X-Signa-Admin": "1" };
let ownerPassword;

before(async () => {
  memoryServer = await MongoMemoryServer.create();
  serviceKey = randomBytes(48).toString("hex");
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: memoryServer.getUri(),
    SERVICE_KEY: serviceKey,
    BREVO_API_KEY: "",
    MAILTRAP_API_TOKEN: "",
    GOOGLE_CLIENT_IDS: "",
  });
  const database = await import("../src/database/database.js");
  const { seedContent } = await import("../src/seeds/seed-content.js");
  const { createApp } = await import("../src/app.js");
  await database.connectDatabase(process.env.DATABASE_URL);
  await seedContent();
  disconnectDatabase = database.disconnectDatabase;
  app = createApp();
  Notifications = await import("../src/services/service-notification.js");
  Scheduler = await import("../src/services/service-notification-scheduler.js");
  ({ EventModel } = await import("../src/models/model-event.js"));
  ({ UserModel } = await import("../src/models/model-user.js"));
  const { createAdmin } = await import("../src/services/service-admin-accounts.js");
  ownerPassword = `${randomBytes(8).toString("hex")}A1`;
  await createAdmin({ admin: null, ip: null }, { email: "owner@notif.test", name: "owner", role: "owner", password: ownerPassword });
});

after(async () => {
  await disconnectDatabase();
  await memoryServer.stop();
});

const withKey = () => ({ "X-Service-Key": serviceKey });

async function registerUser(name) {
  const response = await request(app).post("/internal/v1/auth/register").set(withKey())
    .send({ nickname: name, email: `${name.toLowerCase()}_${randomBytes(3).toString("hex")}@notif.test`, password: `${randomBytes(6).toString("hex")}A1`, acceptedTerms: true });
  assert.equal(response.status, 201, response.body.error);
  return response.body.id;
}

async function panel() {
  const agent = request.agent(app);
  const login = await agent.post("/admin/api/v1/auth/login").set(PANEL).send({ email: "owner@notif.test", password: ownerPassword });
  assert.equal(login.status, 200, login.body.error);
  return agent;
}

const listFor = async (userId) => (await request(app).get(`/internal/v1/users/${userId}/notifications`).set(withKey())).body;

test("conquista dada pelo painel e XP de presente viram notificação, com aviso em tempo real", async () => {
  const userId = await registerUser("Ana");
  const admin = await panel();
  const live = [];
  const listener = (payload) => payload.userId === userId && live.push(payload.notification);
  Notifications.notificationHub.on("notification", listener);

  const detail = (await admin.get(`/admin/api/v1/users/${userId}`).set(PANEL)).body.user;
  const target = detail.achievements.find((achievement) => !achievement.unlocked);
  assert.equal((await admin.put(`/admin/api/v1/users/${userId}/achievements/${target.id}`).set(PANEL).send({ mode: "granted", reason: "teste" })).status, 200);
  assert.equal((await admin.post(`/admin/api/v1/users/${userId}/xp`).set(PANEL).send({ delta: 5000, reason: "teste" })).status, 200);
  Notifications.notificationHub.off("notification", listener);

  const { notifications, unread } = await listFor(userId);
  const types = notifications.map((item) => item.type);
  assert.ok(types.includes("achievement_unlocked"));
  assert.ok(types.includes("xp_bonus"));
  assert.ok(types.includes("level_up"), "5000 XP sobe de nível");
  assert.ok(notifications.find((item) => item.type === "achievement_unlocked").body.includes(target.title));
  assert.equal(unread, notifications.length);
  assert.equal(live.length, notifications.length, "cada uma saiu no tempo real");

  const one = await request(app).post(`/internal/v1/users/${userId}/notifications/read`).set(withKey()).send({ ids: [notifications[0].id] });
  assert.equal(one.body.unread, notifications.length - 1);
  const all = await request(app).post(`/internal/v1/users/${userId}/notifications/read`).set(withKey()).send({ all: true });
  assert.equal(all.body.unread, 0);
  assert.equal((await request(app).post(`/internal/v1/users/${userId}/notifications/read`).set(withKey()).send({})).status, 400);
});

test("painel: desligar um tipo para de criar; texto personalizado com variáveis; padrão de volta", async () => {
  const userId = await registerUser("Bia");
  const admin = await panel();
  const types = (await admin.get("/admin/api/v1/notifications/types").set(PANEL)).body;
  assert.ok(types.types.length >= 8);

  assert.equal((await admin.put("/admin/api/v1/notifications/types/xp_bonus").set(PANEL).send({ enabled: false })).status, 200);
  await admin.post(`/admin/api/v1/users/${userId}/xp`).set(PANEL).send({ delta: 10, reason: "teste" });
  assert.equal((await listFor(userId)).notifications.filter((item) => item.type === "xp_bonus").length, 0);

  const custom = await admin.put("/admin/api/v1/notifications/types/xp_bonus").set(PANEL).send({ enabled: true, title: "Presente!", body: "Chegaram {xp} pontos." });
  assert.equal(custom.status, 200);
  await admin.post(`/admin/api/v1/users/${userId}/xp`).set(PANEL).send({ delta: 7, reason: "teste" });
  const bonus = (await listFor(userId)).notifications.find((item) => item.type === "xp_bonus");
  assert.equal(bonus.title, "Presente!");
  assert.equal(bonus.body, "Chegaram 7 pontos.");

  const reset = await admin.delete("/admin/api/v1/notifications/types/xp_bonus").set(PANEL);
  assert.equal(reset.body.type.title, "Você ganhou XP!");
  assert.equal((await admin.put("/admin/api/v1/notifications/types/nao_existe").set(PANEL).send({ enabled: true })).status, 404);
  assert.equal((await admin.put("/admin/api/v1/notifications/types/manual").set(PANEL).send({ title: "x" })).status, 400);
});

test("aviso manual para todos e para uma pessoa, com histórico de lidas", async () => {
  const ana = await registerUser("Caio");
  const bruno = await registerUser("Duda");
  const admin = await panel();

  const toAll = await admin.post("/admin/api/v1/notifications/send").set(PANEL).send({ title: "Manutenção hoje", body: "O app pode ficar fora às 22h." });
  assert.equal(toAll.status, 201, toAll.body.error);
  assert.ok(toAll.body.recipients >= 2);
  const toOne = await admin.post("/admin/api/v1/notifications/send").set(PANEL).send({ title: "Olá Duda", userId: bruno });
  assert.equal(toOne.body.recipients, 1);
  assert.equal((await admin.post("/admin/api/v1/notifications/send").set(PANEL).send({ title: "" })).status, 400);


  await request(app).post(`/internal/v1/users/${ana}/notifications/read`).set(withKey()).send({ all: true });
  const history = (await admin.get("/admin/api/v1/notifications/history?type=manual").set(PANEL)).body;
  const broadcast = history.items.find((item) => item.id === toAll.body.batch);
  assert.equal(broadcast.recipients, toAll.body.recipients);
  assert.ok(broadcast.read >= 1);
  assert.equal(broadcast.sentBy, "owner@notif.test");
  assert.equal(history.items.find((item) => item.title === "Olá Duda").to.nickname, "Duda");
  assert.equal((await request(app).put(`/internal/v1/users/${ana}/push-token`).set(withKey()).send({ token: "x" })).status, 404);
});

test("versão nova do app avisa todos uma vez por número", async () => {
  const userId = await registerUser("Edu");
  const admin = await panel();
  await admin.put("/admin/api/v1/settings/app.update.versionName").set(PANEL).send({ value: "9.9" });
  await admin.put("/admin/api/v1/settings/app.update.latestVersionCode").set(PANEL).send({ value: 99 });
  await admin.put("/admin/api/v1/settings/app.update.latestVersionCode").set(PANEL).send({ value: 98 });
  await admin.put("/admin/api/v1/settings/app.update.latestVersionCode").set(PANEL).send({ value: 99 });
  const updates = (await listFor(userId)).notifications.filter((item) => item.type === "app_update");
  assert.equal(updates.length, 1);
  assert.match(updates[0].body, /9\.9/);
});

test("evento que começou avisa uma vez; lembrete de ofensiva às 19h, uma vez por dia", async () => {
  const userId = await registerUser("Fabi");
  const now = new Date();
  await EventModel.create({ title: "Sábado 3x", description: "", multiplier: 3, startsAt: new Date(now - 60_000), endsAt: new Date(now.getTime() + 3_600_000) });
  assert.equal(await Scheduler.notifyStartedEvents(now), 1);
  assert.equal(await Scheduler.notifyStartedEvents(now), 0);
  const event = (await listFor(userId)).notifications.find((item) => item.type === "event_started");
  assert.equal(event.title, "Sábado 3x começou!");
  assert.match(event.body, /3x/);

  // Hoje (data real, porque a notificação é gravada com o relógio de verdade), às 20h30 e às 10h de Brasília.
  const { toDayKey } = await import("../src/services/service-streak.js");
  const today = toDayKey(new Date());
  const evening = new Date(`${today}T20:30:00-03:00`);
  const yesterday = toDayKey(new Date(evening.getTime() - 24 * 60 * 60 * 1000));
  await UserModel.updateOne({ _id: userId }, { lastActivityDay: yesterday, streak: 4 });
  assert.equal(await Scheduler.remindStreaks(new Date(`${today}T10:00:00-03:00`)), 0, "antes das 19h não lembra");
  assert.ok(await Scheduler.remindStreaks(evening) >= 1);
  assert.equal(await Scheduler.remindStreaks(evening), 0);
  const reminder = (await listFor(userId)).notifications.find((item) => item.type === "streak_reminder");
  assert.match(reminder.body, /4 dias/);
});

test("fluxo em tempo real (SSE) entrega a notificação ao backend na hora", async () => {
  const userId = await registerUser("Gabi");
  const server = app.listen(0);
  const { port } = server.address();
  const controller = new AbortController();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/internal/v1/notifications/stream`, { headers: withKey(), signal: controller.signal });
    assert.equal(response.headers.get("content-type").split(";")[0], "text/event-stream");
    const reader = response.body.getReader();
    await reader.read(); // ": conectado"
    await Notifications.notifyUser(userId, "account_restored");
    let text = "";
    while (!text.includes("event: notification")) text += new TextDecoder().decode((await reader.read()).value);
    const data = JSON.parse(text.split("data: ")[1].split("\n")[0]);
    assert.equal(data.userId, userId);
    assert.equal(data.notification.title, "Sua conta foi liberada");
    assert.equal((await request(app).get("/internal/v1/notifications/stream")).status, 401, "sem chave de serviço, nada");
  } finally {
    controller.abort();
    server.close();
  }
});
