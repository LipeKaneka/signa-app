import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

// Recuperação de senha com o Brevo (fetch simulado: nada sai de verdade). Com BREVO_API_KEY, o Brevo tem prioridade
// sobre o Mailtrap.
let app;
let memoryServer;
let serviceKey;
let disconnectDatabase;
const realFetch = globalThis.fetch;
const sentMail = [];

before(async () => {
  memoryServer = await MongoMemoryServer.create();
  serviceKey = randomBytes(48).toString("hex");
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: memoryServer.getUri(),
    SERVICE_KEY: serviceKey,
    GOOGLE_CLIENT_IDS: "",
    BREVO_API_KEY: "chave-brevo-teste",
    MAILTRAP_API_TOKEN: "token-mailtrap-nao-usado",
    MAIL_FROM_EMAIL: "signaludus@exemplo.test",
    MAIL_FROM_NAME: "Signa Ludus",
  });
  globalThis.fetch = async (url, options) => {
    if (!/mailtrap\.io|brevo\.com/.test(String(url))) return realFetch(url, options);
    sentMail.push({ url: String(url), headers: options.headers, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ messageId: "<teste@brevo>" }), { status: 201 });
  };

  const database = await import("../src/database/database.js");
  const { seedContent } = await import("../src/seeds/seed-content.js");
  const { createApp } = await import("../src/app.js");
  await database.connectDatabase(process.env.DATABASE_URL);
  await seedContent();
  disconnectDatabase = database.disconnectDatabase;
  app = createApp();
});

after(async () => {
  globalThis.fetch = realFetch;
  await disconnectDatabase();
  await memoryServer.stop();
});

const withKey = () => ({ "X-Service-Key": serviceKey });

test("recuperação de senha: com BREVO_API_KEY, o código vai pela API do Brevo (e não pelo Mailtrap)", async () => {
  const email = `brevo_${randomBytes(3).toString("hex")}@exemplo.test`;
  await request(app).post("/internal/v1/auth/register").set(withKey())
    .send({ nickname: "Brevo", email, password: `${randomBytes(6).toString("hex")}A1`, acceptedTerms: true });

  const response = await request(app).post("/internal/v1/auth/password-reset/request").set(withKey()).send({ email });
  assert.ok(response.status < 300);
  assert.equal(sentMail.length, 1);
  const [mail] = sentMail;
  assert.equal(mail.url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(mail.headers["api-key"], "chave-brevo-teste");
  assert.deepEqual(mail.body.sender, { email: "signaludus@exemplo.test", name: "Signa Ludus" });
  assert.deepEqual(mail.body.to, [{ email }]);
  assert.ok(mail.body.htmlContent.includes("Signa Ludus"));

  const code = mail.body.textContent.match(/\b(\d{6})\b/)[1];
  const verified = await request(app).post("/internal/v1/auth/password-reset/verify").set(withKey()).send({ email, code });
  assert.equal(verified.status, 200);
});
