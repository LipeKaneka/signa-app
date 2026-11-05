import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startTestApp, stopTestApp, registerTestUser, authorized } from "./helpers.js";

let app;

before(async () => {
  app = await startTestApp();
});

after(stopTestApp);

test("cadastro devolve token e perfil sem dados sensíveis", async () => {
  const { response } = await registerTestUser(app, { nickname: "Ana Souza" });
  assert.equal(response.status, 201);
  assert.ok(response.body.token);
  assert.match(response.body.user.publicId, /^ana-souza_[0-9a-f]{6}$/);
  assert.equal(response.body.user.passwordHash, undefined);
  assert.equal(response.body.user._id, undefined);
});

test("cadastro recusa e-mail repetido, senha fraca e e-mail inválido", async () => {
  const first = await registerTestUser(app);
  const repeated = await request(app).post("/api/v1/auth/register")
    .send({ nickname: "Outro", email: first.email, password: "senhaforte123", acceptedTerms: true });
  assert.equal(repeated.status, 409);

  const weak = await request(app).post("/api/v1/auth/register")
    .send({ nickname: "Fraco", email: "fraco@exemplo.test", password: "curta", acceptedTerms: true });
  assert.equal(weak.status, 400);

  const invalidEmail = await request(app).post("/api/v1/auth/register")
    .send({ nickname: "X", email: "nao-e-email", password: "senhaforte123", acceptedTerms: true });
  assert.equal(invalidEmail.status, 400);
});

test("cadastro exige o aceite do Termo de Uso", async () => {
  const { response: missing } = await registerTestUser(app, { acceptedTerms: undefined });
  assert.equal(missing.status, 400);
  assert.match(missing.body.error ?? missing.body.message, /Termo de Uso/);

  const { response: refused } = await registerTestUser(app, { acceptedTerms: false });
  assert.equal(refused.status, 400);
});

test("login aceita a senha certa e dá a mesma mensagem para erros", async () => {
  const user = await registerTestUser(app);
  const ok = await request(app).post("/api/v1/auth/login").send({ email: user.email, password: user.password });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);

  const wrongPassword = await request(app).post("/api/v1/auth/login").send({ email: user.email, password: "errada123" });
  const unknownEmail = await request(app).post("/api/v1/auth/login").send({ email: "ninguem@exemplo.test", password: "errada123" });
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.equal(wrongPassword.body.error, unknownEmail.body.error);
});

test("perfil exige token e traz conquistas", async () => {
  const anonymous = await request(app).get("/api/v1/profile");
  assert.equal(anonymous.status, 401);

  const user = await registerTestUser(app);
  const profile = await request(app).get("/api/v1/profile").set(authorized(user.token));
  assert.equal(profile.status, 200);
  assert.equal(profile.body.user.email, user.email);
  assert.ok(profile.body.achievements.some((achievement) => achievement.id === "streak_7"));
  assert.ok(profile.body.achievements.every((achievement) => achievement.unlocked === false));
});

test("foto de perfil: aceita imagem pequena, recusa SVG e remove com string vazia", async () => {
  const user = await registerTestUser(app);
  const photo = `data:image/jpeg;base64,${Buffer.from("foto-de-teste").toString("base64")}`;
  const thumb = `data:image/jpeg;base64,${Buffer.from("mini").toString("base64")}`;
  const saved = await request(app).patch("/api/v1/profile").set(authorized(user.token)).send({ avatar: photo, avatarThumb: thumb });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.user.avatar, photo);

  // O ranking mostra a miniatura (não a foto inteira).
  const ranking = await request(app).get("/api/v1/ranking").set(authorized(user.token));
  const myRow = ranking.body.neighbors.find((row) => row.isMe) ?? ranking.body.top.find((row) => row.isMe);
  assert.equal(myRow.avatar, thumb);

  const svg = await request(app).patch("/api/v1/profile").set(authorized(user.token))
    .send({ avatar: `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}` });
  assert.equal(svg.status, 400);

  const removed = await request(app).patch("/api/v1/profile").set(authorized(user.token)).send({ avatar: "" });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.user.avatar, "");
  const afterRemoval = await request(app).get("/api/v1/ranking").set(authorized(user.token));
  const rowAfter = afterRemoval.body.neighbors.find((row) => row.isMe) ?? afterRemoval.body.top.find((row) => row.isMe);
  assert.equal(rowAfter.avatar, "");
});

test("trocar e-mail exige a senha atual; campos desconhecidos são recusados", async () => {
  const user = await registerTestUser(app);
  const withoutPassword = await request(app).patch("/api/v1/profile").set(authorized(user.token))
    .send({ email: "novo@exemplo.test" });
  assert.equal(withoutPassword.status, 400);

  const withPassword = await request(app).patch("/api/v1/profile").set(authorized(user.token))
    .send({ email: "novo@exemplo.test", currentPassword: user.password, city: "Recife" });
  assert.equal(withPassword.status, 200);
  assert.equal(withPassword.body.user.email, "novo@exemplo.test");
  assert.equal(withPassword.body.user.city, "Recife");

  const forbiddenField = await request(app).patch("/api/v1/profile").set(authorized(user.token)).send({ xp: 9999 });
  assert.equal(forbiddenField.status, 400);
});

test("excluir conta exige senha e invalida o token", async () => {
  const user = await registerTestUser(app);
  const wrong = await request(app).delete("/api/v1/profile").set(authorized(user.token)).send({ currentPassword: "errada123" });
  assert.equal(wrong.status, 401);

  const deleted = await request(app).delete("/api/v1/profile").set(authorized(user.token)).send({ currentPassword: user.password });
  assert.equal(deleted.status, 200);

  const after = await request(app).get("/api/v1/profile").set(authorized(user.token));
  assert.equal(after.status, 401);
});

test("rota desconhecida responde 404 e CORS só libera o front configurado", async () => {
  const missing = await request(app).get("/api/v1/nao-existe");
  assert.equal(missing.status, 404);

  const allowed = await request(app).get("/api/v1/health").set("Origin", "http://localhost:5173");
  assert.equal(allowed.headers["access-control-allow-origin"], "http://localhost:5173");

  const blocked = await request(app).get("/api/v1/health").set("Origin", "https://site-estranho.example");
  assert.equal(blocked.headers["access-control-allow-origin"], undefined);
});

test("conta banida: login e sessão devolvem motivo e prazo ao app", async () => {
  const user = await registerTestUser(app);
  assert.equal((await request(app).get("/api/v1/auth/session").set(authorized(user.token))).status, 200);

  const { UserModel } = await import("../../server/src/models/model-user.js");
  const until = new Date(Date.now() + 3 * 86400000);
  await UserModel.updateOne({ email: user.email }, { status: "blocked", ban: { reason: "Ofensas no chat", until, bannedAt: new Date() } });

  const login = await request(app).post("/api/v1/auth/login").send({ email: user.email, password: user.password });
  assert.equal(login.status, 403);
  assert.equal(login.body.code, "account_banned");
  assert.deepEqual(login.body.ban, { reason: "Ofensas no chat", until: until.toISOString() });
  assert.equal(login.body.token, undefined);

  // A sessão aberta (cache de 15 s do backend) é recusada assim que conferida no servidor de novo.
  const { forgetSession } = await import("../src/middlewares/auth-middleware.js");
  const { readUserIdFromToken } = await import("../src/utils/util-tokens.js");
  forgetSession(readUserIdFromToken(user.token));
  const session = await request(app).get("/api/v1/auth/session").set(authorized(user.token));
  assert.equal(session.status, 403);
  assert.equal(session.body.code, "account_banned");
});
