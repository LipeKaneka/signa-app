import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

// Login com Google (o Google é simulado: só ele emite tokens de verdade) e e-mail pela API do Mailtrap (fetch simulado).
const CLIENT_ID = "teste-web.apps.googleusercontent.com";
let app;
let memoryServer;
let serviceKey;
let disconnectDatabase;
let setGoogleVerifierForTests;
const realFetch = globalThis.fetch;
const sentMail = [];
let mailtrapStatus = 200;

before(async () => {
  memoryServer = await MongoMemoryServer.create();
  serviceKey = randomBytes(48).toString("hex");
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: memoryServer.getUri(),
    SERVICE_KEY: serviceKey,
    GOOGLE_CLIENT_IDS: CLIENT_ID,
    MAILTRAP_API_TOKEN: "token-de-teste",
    MAIL_FROM_EMAIL: "nao-responda@exemplo.test",
    MAILTRAP_INBOX_ID: "12345",
  });
  globalThis.fetch = async (url, options) => {
    if (!String(url).includes("mailtrap.io")) return realFetch(url, options);
    sentMail.push({ url: String(url), headers: options.headers, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ success: mailtrapStatus === 200 }), { status: mailtrapStatus });
  };

  const database = await import("../src/database/database.js");
  const { seedContent } = await import("../src/seeds/seed-content.js");
  const { createApp } = await import("../src/app.js");
  ({ setGoogleVerifierForTests } = await import("../src/services/service-google-auth.js"));
  await database.connectDatabase(process.env.DATABASE_URL);
  await seedContent();
  disconnectDatabase = database.disconnectDatabase;
  app = createApp();

  // Token "válido" = JSON com os dados da conta; confere se a audiência é o nosso client id.
  setGoogleVerifierForTests(async (idToken, audiences) => {
    assert.deepEqual(audiences, [CLIENT_ID]);
    if (idToken === "invalido") throw new Error("assinatura inválida");
    return JSON.parse(idToken);
  });
});

after(async () => {
  globalThis.fetch = realFetch;
  await disconnectDatabase();
  await memoryServer.stop();
});

const withKey = () => ({ "X-Service-Key": serviceKey });
const google = (body) => request(app).post("/internal/v1/auth/google").set(withKey()).send(body);
const token = (claims) => JSON.stringify({ email_verified: true, name: "Maria Google", ...claims });

test("Google: cria conta nova (com aceite), entra de novo e liga a conta de mesmo e-mail", async () => {
  const sub = randomBytes(6).toString("hex");
  const email = `google_${sub}@exemplo.test`;

  assert.equal((await google({ idToken: token({ sub, email }) })).status, 400); // conta nova sem aceite
  const created = await google({ idToken: token({ sub, email: email.toUpperCase() }), acceptedTerms: true });
  assert.equal(created.status, 200);
  assert.equal(created.body.created, true);
  assert.equal(created.body.user.email, email);
  assert.equal(created.body.user.nickname, "Maria Google");
  assert.equal(created.body.user.googleId, undefined);

  const again = await google({ idToken: token({ sub, email }) });
  assert.equal(again.body.created, false);
  assert.equal(again.body.id, created.body.id);

  // Conta criada com senha: o Google (mesmo e-mail) é ligado a ela, sem criar outra.
  const otherEmail = `senha_${sub}@exemplo.test`;
  const withPassword = await request(app).post("/internal/v1/auth/register").set(withKey())
    .send({ nickname: "Com Senha", email: otherEmail, password: `${randomBytes(6).toString("hex")}A1`, acceptedTerms: true });
  const linked = await google({ idToken: token({ sub: `${sub}x`, email: otherEmail }) });
  assert.equal(linked.body.created, false);
  assert.equal(linked.body.id, withPassword.body.id);
});

test("Google: recusa token inválido, e-mail não confirmado e conta banida", async () => {
  assert.equal((await google({ idToken: "invalido", acceptedTerms: true })).status, 401);
  const unverified = await google({ idToken: token({ sub: "u1", email: "nao@exemplo.test", email_verified: false }), acceptedTerms: true });
  assert.equal(unverified.status, 401);

  const sub = randomBytes(6).toString("hex");
  const created = await google({ idToken: token({ sub, email: `ban_${sub}@exemplo.test` }), acceptedTerms: true });
  const { UserModel } = await import("../src/models/model-user.js");
  await UserModel.updateOne({ _id: created.body.id }, { status: "blocked", ban: { reason: "Teste", until: null, bannedAt: new Date() } });
  const banned = await google({ idToken: token({ sub, email: `ban_${sub}@exemplo.test` }) });
  assert.equal(banned.status, 403);
  assert.equal(banned.body.code, "account_banned");
});

test("recuperação de senha: o código vai pela API do Mailtrap; falha no envio libera pedir de novo", async () => {
  const email = `mail_${randomBytes(3).toString("hex")}@exemplo.test`;
  await request(app).post("/internal/v1/auth/register").set(withKey())
    .send({ nickname: "Mail", email, password: `${randomBytes(6).toString("hex")}A1`, acceptedTerms: true });

  sentMail.length = 0;
  const ok = await request(app).post("/internal/v1/auth/password-reset/request").set(withKey()).send({ email });
  assert.ok(ok.status < 300);
  assert.equal(sentMail.length, 1);
  const [mail] = sentMail;
  assert.equal(mail.url, "https://sandbox.api.mailtrap.io/api/send/12345");
  assert.equal(mail.headers.Authorization, "Bearer token-de-teste");
  assert.deepEqual(mail.body.to, [{ email }]);
  assert.equal(mail.body.from.email, "nao-responda@exemplo.test");
  const code = mail.body.text.match(/\b(\d{6})\b/)[1];
  const verified = await request(app).post("/internal/v1/auth/password-reset/verify").set(withKey()).send({ email, code });
  assert.equal(verified.status, 200);

  // Mailtrap recusa: 503 com a mensagem para o usuário, e dá para pedir de novo na hora (sem esperar 1 minuto).
  const other = `falha_${randomBytes(3).toString("hex")}@exemplo.test`;
  await request(app).post("/internal/v1/auth/register").set(withKey())
    .send({ nickname: "Falha", email: other, password: `${randomBytes(6).toString("hex")}A1`, acceptedTerms: true });
  mailtrapStatus = 401;
  const failed = await request(app).post("/internal/v1/auth/password-reset/request").set(withKey()).send({ email: other });
  assert.equal(failed.status, 503);
  assert.equal(failed.body.code, "mail_failed");
  mailtrapStatus = 200;
  const retry = await request(app).post("/internal/v1/auth/password-reset/request").set(withKey()).send({ email: other });
  assert.ok(retry.status < 300);
});
