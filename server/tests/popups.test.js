import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

// Pop-ups do app: avisos e manutenção (com contas liberadas, bloqueio das outras e e-mails de início e fim).
let app;
let memoryServer;
let serviceKey;
let disconnectDatabase;
let syncMaintenance;
const sentEmails = [];
const realFetch = globalThis.fetch;
const adminPassword = `${randomBytes(8).toString("hex")}A1`;

before(async () => {
  memoryServer = await MongoMemoryServer.create();
  serviceKey = randomBytes(48).toString("hex");
  // Com chave do Brevo "falsa": os e-mails não saem de verdade, são capturados no fetch abaixo.
  Object.assign(process.env, {
    NODE_ENV: "test", DATABASE_URL: memoryServer.getUri(), SERVICE_KEY: serviceKey, GOOGLE_CLIENT_IDS: "",
    BREVO_API_KEY: "teste-sem-envio", MAIL_FROM_EMAIL: "avisos@signa.test", MAILTRAP_API_TOKEN: "",
  });
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("api.brevo.com")) {
      sentEmails.push(JSON.parse(options.body));
      return new Response("{}", { status: 201 });
    }
    return realFetch(url, options);
  };

  const database = await import("../src/database/database.js");
  const { seedContent } = await import("../src/seeds/seed-content.js");
  const { createApp } = await import("../src/app.js");
  await database.connectDatabase(process.env.DATABASE_URL);
  await seedContent();
  disconnectDatabase = database.disconnectDatabase;
  app = createApp();
  ({ syncMaintenance } = await import("../src/services/service-popups.js"));
  const { createAdmin } = await import("../src/services/service-admin-accounts.js");
  await createAdmin({ admin: null, ip: null }, { email: "owner@painel.test", name: "Dono", role: "owner", password: adminPassword });
});

after(async () => {
  globalThis.fetch = realFetch;
  await disconnectDatabase();
  await memoryServer.stop();
});

const PANEL = { "X-Signa-Admin": "1" };
const withKey = () => ({ "X-Service-Key": serviceKey });

async function signInPanel() {
  const agent = request.agent(app);
  const response = await agent.post("/admin/api/v1/auth/login").set(PANEL).send({ email: "owner@painel.test", password: adminPassword });
  assert.equal(response.status, 200, response.body.error);
  return agent;
}

async function registerUser(email) {
  const response = await request(app).post("/internal/v1/auth/register").set(withKey())
    .send({ nickname: `Pessoa ${email.split("@")[0]}`, email, password: "senhaTeste1", acceptedTerms: true });
  assert.equal(response.status, 201, response.body.error);
  return response.body.id;
}

const waitForEmails = async (count) => {
  for (let i = 0; i < 50 && sentEmails.length < count; i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
};

test("avisos: criados no painel chegam ao app só quando ativos e dentro do período", async () => {
  const panel = await signInPanel();
  const created = await panel.post("/admin/api/v1/popups/announcements").set(PANEL)
    .send({ title: "Semana da Libras", message: "Atividades novas toda semana.", notesTitle: "Novidades", notes: "Módulo de cores." });
  assert.equal(created.status, 201, created.body.error);
  await panel.post("/admin/api/v1/popups/announcements").set(PANEL)
    .send({ title: "Futuro", startsAt: new Date(Date.now() + 86_400_000).toISOString() });
  const badLink = await panel.post("/admin/api/v1/popups/announcements").set(PANEL).send({ title: "Link", link: "http://inseguro.test" });
  assert.equal(badLink.status, 400);

  const config = await request(app).get("/internal/v1/app-config").set(withKey());
  assert.deepEqual(config.body.popups.announcements.map((item) => item.title), ["Semana da Libras"]);
  assert.equal(config.body.popups.announcements[0].buttonText, "Entendi"); // padrão quando o painel deixa vazio
  assert.equal(config.body.popups.maintenance.active, false);

  const id = created.body.announcement.id;
  await panel.patch(`/admin/api/v1/popups/announcements/${id}`).set(PANEL).send({ active: false });
  const after = await request(app).get("/internal/v1/app-config").set(withKey());
  assert.equal(after.body.popups.announcements.length, 0);
});

test("manutenção: só liberados entram; os outros recebem 503 maintenance; e-mails no início e no fim", async () => {
  const blockedId = await registerUser("aluno@exemplo.test");
  const staffId = await registerUser("equipe@exemplo.test");
  const panel = await signInPanel();
  sentEmails.length = 0;

  const turnedOn = await panel.put("/admin/api/v1/popups/maintenance").set(PANEL).send({
    enabled: true,
    allowedEmails: "Equipe@Exemplo.test",
    message: "Voltamos já!",
    startEmail: { enabled: true, subject: "Manutenção, {nome}", body: "Olá, {nome}! Voltamos em {previsao}." },
    endEmail: { enabled: true, subject: "Voltamos", body: "Pode entrar, {nome}." },
    endEmailAudience: "blocked",
  });
  assert.equal(turnedOn.status, 200, turnedOn.body.error);
  assert.equal(turnedOn.body.maintenance.active, true);
  assert.deepEqual(turnedOn.body.maintenance.allowedEmails, ["equipe@exemplo.test"]);

  // E-mail de início para todas as contas ativas (as duas desta conta de teste e as do seed, se houver).
  await waitForEmails(2);
  const startSubjects = sentEmails.map((email) => email.subject);
  assert.ok(startSubjects.includes("Manutenção, Pessoa aluno"));
  assert.ok(sentEmails.some((email) => email.textContent.includes("assim que possível")));

  const config = await request(app).get("/internal/v1/app-config").set(withKey());
  assert.equal(config.body.popups.maintenance.active, true);
  assert.equal(config.body.popups.maintenance.message, "Voltamos já!");
  assert.equal(config.body.popups.maintenance.buttonText, "Fechar o app");

  const blocked = await request(app).get(`/internal/v1/users/${blockedId}/profile`).set(withKey());
  assert.equal(blocked.status, 503);
  assert.equal(blocked.body.code, "maintenance");
  assert.equal(blocked.body.maintenance.title, "Manutenção");
  const blockedSession = await request(app).get(`/internal/v1/users/${blockedId}/session`).set(withKey());
  assert.equal(blockedSession.status, 503);
  const blockedLogin = await request(app).post("/internal/v1/auth/verify-credentials").set(withKey()).send({ email: "aluno@exemplo.test", password: "senhaTeste1" });
  assert.equal(blockedLogin.status, 503);
  const newAccount = await request(app).post("/internal/v1/auth/register").set(withKey())
    .send({ nickname: "Nova", email: "nova@exemplo.test", password: "senhaTeste1", acceptedTerms: true });
  assert.equal(newAccount.status, 503);

  const staff = await request(app).get(`/internal/v1/users/${staffId}/profile`).set(withKey());
  assert.equal(staff.status, 200);
  const staffLogin = await request(app).post("/internal/v1/auth/verify-credentials").set(withKey()).send({ email: "equipe@exemplo.test", password: "senhaTeste1" });
  assert.equal(staffLogin.status, 200);

  const status = await panel.get("/admin/api/v1/popups/maintenance").set(PANEL);
  assert.equal(status.body.maintenance.blockedCount, 1);

  // Desligar: e-mail de fim só para quem foi barrado; o app volta a funcionar para todos.
  sentEmails.length = 0;
  const turnedOff = await panel.put("/admin/api/v1/popups/maintenance").set(PANEL).send({ enabled: false });
  assert.equal(turnedOff.body.maintenance.active, false);
  await waitForEmails(1);
  assert.deepEqual(sentEmails.map((email) => email.to[0].email), ["aluno@exemplo.test"]);
  assert.equal(sentEmails[0].textContent, "Pode entrar, Pessoa aluno.");
  const back = await request(app).get(`/internal/v1/users/${blockedId}/profile`).set(withKey());
  assert.equal(back.status, 200);
});

test("manutenção agendada: começa e termina pelo relógio (agendador), um e-mail por passagem", async () => {
  const panel = await signInPanel();
  sentEmails.length = 0;
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const saved = await panel.put("/admin/api/v1/popups/maintenance").set(PANEL).send({
    enabled: true, startsAt: start.toISOString(), endsAt: end.toISOString(),
    startEmail: { enabled: true, subject: "Começou", body: "Volta em {previsao}." }, endEmail: { enabled: false },
  });
  assert.equal(saved.body.maintenance.active, false); // ainda não começou

  assert.equal(await syncMaintenance(new Date(start.getTime() + 1000)), "started");
  assert.equal(await syncMaintenance(new Date(start.getTime() + 2000)), null); // não repete
  await waitForEmails(1);
  assert.ok(sentEmails.length >= 1 && sentEmails.every((email) => email.subject === "Começou"));
  const count = sentEmails.length;
  assert.equal(await syncMaintenance(new Date(end.getTime() + 1000)), "ended");
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(sentEmails.length, count); // e-mail de fim desligado

  const badPeriod = await panel.put("/admin/api/v1/popups/maintenance").set(PANEL)
    .send({ startsAt: end.toISOString(), endsAt: start.toISOString() });
  assert.equal(badPeriod.status, 400);
  await panel.put("/admin/api/v1/popups/maintenance").set(PANEL).send({ enabled: false, startsAt: null, endsAt: null });
});
