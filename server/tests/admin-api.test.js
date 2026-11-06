import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

// Etapa 5: API do painel (/admin/api/v1): sessão, papéis, CSRF, auditoria e efeito das mudanças no app.
let app;
let memoryServer;
let serviceKey;
let disconnectDatabase;
let createAdmin;
let resetLoginFailures;
const passwords = new Map();

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
  ({ createAdmin } = await import("../src/services/service-admin-accounts.js"));
  ({ resetLoginFailures } = await import("../src/services/service-admin-auth.js"));

  for (const role of ["owner", "admin", "editor", "viewer"]) {
    const password = `${randomBytes(8).toString("hex")}A1`;
    passwords.set(role, password);
    await createAdmin({ admin: null, ip: null }, { email: `${role}@painel.test`, name: role, role, password });
  }
});

after(async () => {
  await disconnectDatabase();
  await memoryServer.stop();
});

const PANEL = { "X-Signa-Admin": "1" };
const withKey = () => ({ "X-Service-Key": serviceKey });

/** Agente (guarda o cookie) já logado com o papel pedido. */
async function signIn(role) {
  const agent = request.agent(app);
  const response = await agent.post("/admin/api/v1/auth/login").set(PANEL).send({ email: `${role}@painel.test`, password: passwords.get(role) });
  assert.equal(response.status, 200, response.body.error);
  return agent;
}

test("login: exige o cabeçalho do painel, recusa senha errada e cria cookie httpOnly/Strict", async () => {
  const withoutHeader = await request(app).post("/admin/api/v1/auth/login").send({ email: "owner@painel.test", password: "x" });
  assert.equal(withoutHeader.status, 403);

  const wrong = await request(app).post("/admin/api/v1/auth/login").set(PANEL).send({ email: "owner@painel.test", password: "errada123456" });
  assert.equal(wrong.status, 401);
  const unknown = await request(app).post("/admin/api/v1/auth/login").set(PANEL).send({ email: "ninguem@painel.test", password: "errada123456" });
  assert.equal(unknown.body.error, wrong.body.error);

  const ok = await request(app).post("/admin/api/v1/auth/login").set(PANEL).send({ email: "owner@painel.test", password: passwords.get("owner") });
  assert.equal(ok.status, 200);
  const cookie = ok.headers["set-cookie"][0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\/admin/);
  assert.equal(ok.body.admin.passwordHash, undefined);
  assert.equal(ok.body.permissions.admins, true);

  const noSession = await request(app).get("/admin/api/v1/auth/me").set(PANEL);
  assert.equal(noSession.status, 401);
  resetLoginFailures();
});

test("login: 5 senhas erradas seguidas bloqueiam o e-mail por um tempo (429)", async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await request(app).post("/admin/api/v1/auth/login").set(PANEL).send({ email: "viewer@painel.test", password: "errada123456" });
  }
  const blocked = await request(app).post("/admin/api/v1/auth/login").set(PANEL).send({ email: "viewer@painel.test", password: passwords.get("viewer") });
  assert.equal(blocked.status, 429);
  resetLoginFailures();
});

test("papéis: viewer só lê; editor mexe em conteúdo; admin em eventos e usuários; só owner em contas do painel", async () => {
  const viewer = await signIn("viewer");
  assert.equal((await viewer.get("/admin/api/v1/modules").set(PANEL)).status, 200);
  assert.equal((await viewer.post("/admin/api/v1/signs").set(PANEL).send({ word: "Teste", category: "X" })).status, 403);

  const editor = await signIn("editor");
  assert.equal((await editor.post("/admin/api/v1/signs").set(PANEL).send({ word: "Papel editor", category: "Testes" })).status, 201);
  const now = Date.now();
  const eventBody = { title: "2x", multiplier: 2, startsAt: new Date(now).toISOString(), endsAt: new Date(now + 60_000).toISOString() };
  assert.equal((await editor.post("/admin/api/v1/events").set(PANEL).send(eventBody)).status, 403);
  assert.equal((await editor.get("/admin/api/v1/audit-log").set(PANEL)).status, 403);

  const admin = await signIn("admin");
  assert.equal((await admin.post("/admin/api/v1/events").set(PANEL).send(eventBody)).status, 201);
  assert.equal((await admin.get("/admin/api/v1/admins").set(PANEL)).status, 403);

  const owner = await signIn("owner");
  assert.equal((await owner.get("/admin/api/v1/admins").set(PANEL)).status, 200);
});

test("CSRF: alteração vinda de outra origem é recusada", async () => {
  const editor = await signIn("editor");
  const response = await editor
    .post("/admin/api/v1/signs")
    .set({ ...PANEL, Origin: "https://site-malicioso.test" })
    .send({ word: "Invasor", category: "X" });
  assert.equal(response.status, 403);
});

test("conteúdo criado no painel aparece no app, desativar esconde e a versão do conteúdo sobe", async () => {
  const editor = await signIn("editor");
  const versionBefore = (await request(app).get("/internal/v1/content/version").set(withKey())).body.version;

  await editor.post("/admin/api/v1/signs").set(PANEL).send({ word: "Obrigado painel", category: "Testes", vlibrasGloss: "obrigado" });
  const module = await editor.post("/admin/api/v1/modules").set(PANEL).send({ title: "Módulo do painel", level: 2, prerequisiteId: null });
  assert.equal(module.status, 201);
  const activity = await editor.post("/admin/api/v1/activities").set(PANEL).send({
    moduleId: module.body.module.id,
    title: "Atividade do painel",
    questions: [
      {
        type: "sign_choice",
        prompt: "Qual sinal é esse?",
        signSlug: "obrigado-painel",
        options: [{ id: "a", text: "Obrigado" }, { id: "b", text: "Oi" }],
        correctOptionId: "a",
      },
    ],
  });
  assert.equal(activity.status, 201, activity.body.error);
  assert.equal(activity.body.activity.questions[0].sign.gloss, "OBRIGADO");

  const badQuestion = await editor.post("/admin/api/v1/activities").set(PANEL).send({
    moduleId: module.body.module.id,
    title: "Sem gabarito",
    questions: [{ type: "single_choice", prompt: "?", options: [{ id: "a", text: "1" }, { id: "b", text: "2" }], correctOptionId: "z" }],
  });
  assert.equal(badQuestion.status, 400);

  const account = await request(app).post("/internal/v1/auth/register").set(withKey())
    .send({ nickname: "Aluno", email: `aluno_${randomBytes(3).toString("hex")}@exemplo.test`, password: `${randomBytes(6).toString("hex")}A1` });
  const trailPath = `/internal/v1/users/${account.body.id}/trail`;
  const trail = await request(app).get(trailPath).set(withKey());
  const created = trail.body.modules.find((entry) => entry.id === module.body.module.id);
  assert.equal(created.status, "available");

  await editor.patch(`/admin/api/v1/modules/${module.body.module.id}`).set(PANEL).send({ active: false });
  const hidden = await request(app).get(trailPath).set(withKey());
  assert.ok(!hidden.body.modules.some((entry) => entry.id === module.body.module.id));

  await editor.patch("/admin/api/v1/signs/obrigado-painel").set(PANEL).send({ active: false });
  const sign = await request(app).get("/internal/v1/dictionary/signs/obrigado-painel").set(withKey());
  assert.equal(sign.status, 404);

  const versionAfter = (await request(app).get("/internal/v1/content/version").set(withKey())).body.version;
  assert.ok(versionAfter >= versionBefore + 5);

  const deleteActive = await (await signIn("admin")).delete(`/admin/api/v1/activities/${activity.body.activity.id}`).set(PANEL);
  assert.equal(deleteActive.status, 400);
});

test("auditoria registra quem mudou o quê, sem senhas", async () => {
  const admin = await signIn("admin");
  const phrases = [{ title: "Mandou bem!", text: "continue assim" }];
  await admin.put("/admin/api/v1/settings/app.feedback.correctPhrases").set(PANEL).send({ value: phrases });
  const config = await request(app).get("/internal/v1/app-config").set(withKey());
  assert.deepEqual(config.body.settings["app.feedback.correctPhrases"], phrases);
  const invalid = await admin.put("/admin/api/v1/settings/app.feedback.correctPhrases").set(PANEL).send({ value: [] });
  assert.equal(invalid.status, 400);

  const logs = await admin.get("/admin/api/v1/audit-log?entity=setting").set(PANEL);
  assert.equal(logs.status, 200);
  assert.equal(logs.body.logs[0].adminEmail, "admin@painel.test");
  assert.deepEqual(logs.body.logs[0].after, phrases);

  const all = await admin.get("/admin/api/v1/audit-log?limit=200").set(PANEL);
  assert.ok(!JSON.stringify(all.body).includes("passwordHash"));
  assert.ok(all.body.logs.some((log) => log.action === "login"));
});

test("usuários: bloquear tira o acesso ao app; XP e progresso exigem motivo", async () => {
  const admin = await signIn("admin");
  const account = await request(app).post("/internal/v1/auth/register").set(withKey())
    .send({ nickname: "Moderado", email: `mod_${randomBytes(3).toString("hex")}@exemplo.test`, password: `${randomBytes(6).toString("hex")}A1` });

  const list = await admin.get("/admin/api/v1/users?search=Moderado").set(PANEL);
  assert.equal(list.body.users[0].id, account.body.id);

  const withoutReason = await admin.patch(`/admin/api/v1/users/${account.body.id}/status`).set(PANEL).send({ status: "blocked" });
  assert.equal(withoutReason.status, 400);
  await admin.patch(`/admin/api/v1/users/${account.body.id}/status`).set(PANEL).send({ status: "blocked", reason: "teste" });
  assert.equal((await request(app).get(`/internal/v1/users/${account.body.id}/session`).set(withKey())).status, 403);

  const xp = await admin.post(`/admin/api/v1/users/${account.body.id}/xp`).set(PANEL).send({ delta: 50, reason: "bônus" });
  assert.equal(xp.body.user.xp, 50);
  const reset = await admin.post(`/admin/api/v1/users/${account.body.id}/reset-progress`).set(PANEL).send({ reason: "pedido" });
  assert.equal(reset.body.user.xp, 0);
});

test("banimento: login e sessão recebem motivo e prazo; prazo vencido libera a conta", async () => {
  const admin = await signIn("admin");
  const email = `ban_${randomBytes(3).toString("hex")}@exemplo.test`;
  const password = `${randomBytes(6).toString("hex")}A1`;
  const account = await request(app).post("/internal/v1/auth/register").set(withKey()).send({ nickname: "Banido", email, password });
  const statusPath = `/admin/api/v1/users/${account.body.id}/status`;

  assert.equal((await admin.patch(statusPath).set(PANEL).send({ status: "blocked", reason: "x", durationDays: 0.5 })).status, 400);
  const banned = await admin.patch(statusPath).set(PANEL).send({ status: "blocked", reason: "Spam no ranking", durationDays: 7 });
  assert.equal(banned.body.user.status, "blocked");
  assert.equal(banned.body.user.ban.reason, "Spam no ranking");
  const days = (new Date(banned.body.user.ban.until).getTime() - Date.now()) / 86400000;
  assert.ok(days > 6.9 && days <= 7);

  const login = await request(app).post("/internal/v1/auth/verify-credentials").set(withKey()).send({ email, password });
  assert.equal(login.status, 403);
  assert.equal(login.body.code, "account_banned");
  assert.equal(login.body.ban.reason, "Spam no ranking");
  assert.equal(login.body.ban.until, banned.body.user.ban.until);
  const session = await request(app).get(`/internal/v1/users/${account.body.id}/session`).set(withKey());
  assert.equal(session.body.code, "account_banned");
  // Senha errada não revela o banimento.
  assert.equal((await request(app).post("/internal/v1/auth/verify-credentials").set(withKey()).send({ email, password: "Errada123" })).status, 401);

  const permanent = await admin.patch(statusPath).set(PANEL).send({ status: "blocked", reason: "Grave" });
  assert.equal(permanent.body.user.ban.until, null);
  assert.equal((await admin.get("/admin/api/v1/users?status=blocked&search=Banido").set(PANEL)).body.users.length >= 1, true);

  // Prazo vencido: a conta volta sozinha no próximo acesso.
  const { UserModel } = await import("../src/models/model-user.js");
  await UserModel.updateOne({ _id: account.body.id }, { "ban.until": new Date(Date.now() - 1000) });
  assert.equal((await request(app).post("/internal/v1/auth/verify-credentials").set(withKey()).send({ email, password })).status, 200);
  assert.equal((await UserModel.findById(account.body.id).lean()).status, "active");

  const unbanned = await admin.patch(statusPath).set(PANEL).send({ status: "active", reason: "ok" });
  assert.equal(unbanned.body.user.ban, null);
});

test("níveis: tabela inválida é recusada; válida vale no app", async () => {
  const admin = await signIn("admin");
  const invalid = await admin.put("/admin/api/v1/levels").set(PANEL).send({ levels: [{ minXp: 10, title: "A" }] });
  assert.equal(invalid.status, 400);
  const valid = await admin.put("/admin/api/v1/levels").set(PANEL).send({ levels: [{ minXp: 0, title: "Novato" }, { minXp: 50, title: "Veterano" }] });
  assert.equal(valid.status, 200);
  const config = await request(app).get("/internal/v1/app-config").set(withKey());
  assert.deepEqual(config.body.levels.map((level) => level.title), ["Novato", "Veterano"]);
});

test("contas do painel: o último owner não pode ser rebaixado; desativar derruba a sessão na hora", async () => {
  const owner = await signIn("owner");
  const admins = (await owner.get("/admin/api/v1/admins").set(PANEL)).body.admins;
  const ownerId = admins.find((entry) => entry.role === "owner").id;
  const self = await owner.patch(`/admin/api/v1/admins/${ownerId}`).set(PANEL).send({ role: "viewer" });
  assert.equal(self.status, 400);

  const password = `${randomBytes(8).toString("hex")}B2`;
  const created = await owner.post("/admin/api/v1/admins").set(PANEL).send({ email: "temp@painel.test", name: "Temp", role: "owner", password });
  assert.equal(created.status, 201);
  const weak = await owner.post("/admin/api/v1/admins").set(PANEL).send({ email: "fraca@painel.test", name: "F", role: "viewer", password: "curta1" });
  assert.equal(weak.status, 400);

  const temp = request.agent(app);
  await temp.post("/admin/api/v1/auth/login").set(PANEL).send({ email: "temp@painel.test", password });
  assert.equal((await temp.get("/admin/api/v1/auth/me").set(PANEL)).status, 200);
  await owner.patch(`/admin/api/v1/admins/${created.body.admin.id}`).set(PANEL).send({ status: "disabled" });
  assert.equal((await temp.get("/admin/api/v1/auth/me").set(PANEL)).status, 401);
});

test("exportar conteúdo traz tudo menos usuários e contas", async () => {
  const admin = await signIn("admin");
  const response = await admin.get("/admin/api/v1/database/export").set(PANEL);
  assert.equal(response.status, 200);
  assert.equal(response.body.format, "signa-ludus-content");
  assert.ok(response.body.signs.length > 0);
  assert.equal(response.body.users, undefined);
  assert.match(response.headers["content-disposition"], /attachment/);
});

test("dashboard: /analytics devolve indicadores, série diária do período e funil", async () => {
  const viewer = await signIn("viewer");
  const response = await viewer.get("/admin/api/v1/analytics?days=7").set(PANEL);
  assert.equal(response.status, 200, response.body.error);
  assert.equal(response.body.days, 7);
  assert.equal(response.body.series.length, 7);
  assert.ok("value" in response.body.kpis.activeUsers);
  assert.ok(Array.isArray(response.body.funnel) && response.body.funnel.length > 0);
  // Período fora da lista cai no padrão (30 dias).
  const fallback = await viewer.get("/admin/api/v1/analytics?days=999").set(PANEL);
  assert.equal(fallback.body.days, 30);
});

test("banco de dados: só o dono acessa o explorador", async () => {
  for (const role of ["admin", "editor", "viewer"]) {
    const agent = await signIn(role);
    const response = await agent.get("/admin/api/v1/database/collections").set(PANEL);
    assert.equal(response.status, 403, role);
  }
  const owner = await signIn("owner");
  const response = await owner.get("/admin/api/v1/database/collections").set(PANEL);
  assert.equal(response.status, 200);
  assert.ok(response.body.collections.some((collection) => collection.key === "users"));
});

test("banco de dados: campos sensíveis nunca saem e não podem ser escritos", async () => {
  const account = await request(app).post("/internal/v1/auth/register").set(withKey())
    .send({ nickname: "Explorador", email: `explorador_${randomBytes(3).toString("hex")}@exemplo.test`, password: `${randomBytes(6).toString("hex")}A1` });
  const owner = await signIn("owner");
  const base = `/admin/api/v1/database/collections/users/documents/${account.body.id}`;

  const opened = await owner.get(base).set(PANEL);
  assert.equal(opened.status, 200);
  assert.equal(opened.body.document.passwordHash, undefined);
  assert.equal(opened.body.document.passwordReset, undefined);
  const listed = await owner.get("/admin/api/v1/database/collections/users/documents").query({ search: "Explorador" }).set(PANEL);
  assert.ok(listed.body.documents.every((document) => document.passwordHash === undefined));

  for (const changes of [{ passwordHash: "x" }, { $set: { xp: 1 } }, { "passwordReset.codeHash": "x" }, { publicId: "outro" }, {}]) {
    const refused = await owner.patch(base).set(PANEL).send({ changes });
    assert.equal(refused.status, 400, JSON.stringify(changes));
  }

  const updated = await owner.patch(base).set(PANEL).send({ changes: { nickname: "Explorador Editado", xp: 77 } });
  assert.equal(updated.status, 200, updated.body.error);
  assert.equal(updated.body.document.nickname, "Explorador Editado");
  assert.equal(updated.body.document.xp, 77);

  // Regras do modelo continuam valendo (xp não pode ser negativo).
  const invalid = await owner.patch(base).set(PANEL).send({ changes: { xp: -5 } });
  assert.equal(invalid.status, 400);

  const audit = await owner.get("/admin/api/v1/audit-log").query({ entity: "database:users" }).set(PANEL);
  assert.ok(audit.body.logs.some((log) => log.summary.includes("nickname")));
});

test("banco de dados: coleções só leitura recusam escrita; criar e excluir exigem as regras", async () => {
  const owner = await signIn("owner");
  const settings = await owner.get("/admin/api/v1/database/collections/settings/documents").set(PANEL);
  const anySetting = settings.body.documents[0];
  if (anySetting) {
    const refused = await owner.patch(`/admin/api/v1/database/collections/settings/documents/${anySetting._id}`).set(PANEL).send({ changes: { key: "x" } });
    assert.equal(refused.status, 400);
  }
  const auditDelete = await owner.delete("/admin/api/v1/database/collections/auditLogs/documents/0123456789abcdef01234567").set(PANEL).send({ confirm: "EXCLUIR" });
  assert.equal(auditDelete.status, 400);
  const unknown = await owner.get("/admin/api/v1/database/collections/segredos/documents").set(PANEL);
  assert.equal(unknown.status, 404);

  const missingWord = await owner.post("/admin/api/v1/database/collections/signs/documents").set(PANEL).send({ document: { category: "Teste" } });
  assert.equal(missingWord.status, 400);
  const created = await owner.post("/admin/api/v1/database/collections/signs/documents").set(PANEL)
    .send({ document: { slug: `sinal-teste-${randomBytes(2).toString("hex")}`, word: "Sinal teste", category: "Teste", source: { name: "Teste", license: "CC-BY", attribution: "Equipe" } } });
  assert.equal(created.status, 201, created.body.error);

  const path = `/admin/api/v1/database/collections/signs/documents/${created.body.document._id}`;
  const withoutConfirm = await owner.delete(path).set(PANEL).send({});
  assert.equal(withoutConfirm.status, 400);
  const deleted = await owner.delete(path).set(PANEL).send({ confirm: "EXCLUIR" });
  assert.equal(deleted.status, 200);
  assert.equal((await owner.get(path).set(PANEL)).status, 404);

  const csv = await owner.get("/admin/api/v1/database/collections/levels/export").query({ format: "csv" }).set(PANEL);
  assert.equal(csv.status, 200);
  assert.match(csv.headers["content-type"], /text\/csv/);
});

test("eventos: multiplicador sem teto e aparência da faixa (salva, valida e vai para o app)", async () => {
  const admin = await signIn("admin");
  const now = Date.now();
  const base = { title: "Mega evento", startsAt: new Date(now - 60_000).toISOString(), endsAt: new Date(now + 3_600_000).toISOString() };

  const badColor = await admin.post("/admin/api/v1/events").set(PANEL).send({ ...base, multiplier: 2, appearance: { colorFrom: "amarelo" } });
  assert.equal(badColor.status, 400);
  const below = await admin.post("/admin/api/v1/events").set(PANEL).send({ ...base, multiplier: 0.5 });
  assert.equal(below.status, 400);

  const appearance = { style: "solid", colorFrom: "#19163A", textColor: "#ffffff", accentColor: "#8b6cf0", accentTextColor: "#ffffff", icon: "🔥" };
  const created = await admin.post("/admin/api/v1/events").set(PANEL).send({ ...base, multiplier: 50, appearance });
  assert.equal(created.status, 201, created.body.error);
  assert.equal(created.body.event.multiplier, 50);
  assert.equal(created.body.event.appearance.colorFrom, "#19163a");
  assert.equal(created.body.event.appearance.icon, "🔥");

  // Editar só uma cor mantém o resto da aparência.
  const edited = await admin.patch(`/admin/api/v1/events/${created.body.event.id}`).set(PANEL).send({ appearance: { textColor: "#eeeeee" } });
  assert.equal(edited.status, 200, edited.body.error);
  assert.equal(edited.body.event.appearance.textColor, "#eeeeee");
  assert.equal(edited.body.event.appearance.style, "solid");

  const active = await request(app).get("/internal/v1/events/active").set(withKey());
  const fromApp = active.body.events.find((event) => event.id === created.body.event.id);
  assert.equal(fromApp.multiplier, 50);
  assert.equal(fromApp.appearance.style, "solid");
  await admin.delete(`/admin/api/v1/events/${created.body.event.id}`).set(PANEL);
});
