import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import request from "supertest";
import { startTestApp, stopTestApp, registerTestUser } from "./helpers.js";

// Recuperação de senha por código (telas "Esqueceu a senha?" e "Insira o código" do protótipo).
const SERVER_SOURCE = "../../server/src";

let app;
let UserModel;

before(async () => {
  app = await startTestApp();
  ({ UserModel } = await import(`${SERVER_SOURCE}/models/model-user.js`));
});

after(stopTestApp);

/** Coloca um código conhecido na conta (nos testes não há e-mail para ler o código enviado). */
async function plantCode(email, code) {
  const codeHash = createHash("sha256").update(`${email}:${code}`).digest("hex");
  await UserModel.updateOne(
    { email },
    { passwordReset: { codeHash, expiresAt: new Date(Date.now() + 60_000), attempts: 0, sentAt: new Date(0) } },
  );
}

test("pedir código responde igual para conta existente e inexistente", async () => {
  const user = await registerTestUser(app);
  const existing = await request(app).post("/api/v1/auth/password-reset/request").send({ email: user.email });
  const missing = await request(app).post("/api/v1/auth/password-reset/request").send({ email: "ninguem@exemplo.test" });
  assert.equal(existing.status, 200);
  assert.equal(missing.status, 200);
  assert.equal(existing.body.message, missing.body.message);

  const again = await request(app).post("/api/v1/auth/password-reset/request").send({ email: user.email });
  assert.equal(again.status, 429);
});

test("código errado é recusado; o certo troca a senha e já abre a sessão", async () => {
  const user = await registerTestUser(app);
  await plantCode(user.email, "123456");

  const wrong = await request(app).post("/api/v1/auth/password-reset/verify").send({ email: user.email, code: "654321" });
  assert.equal(wrong.status, 400);
  const malformed = await request(app).post("/api/v1/auth/password-reset/verify").send({ email: user.email, code: "12ab" });
  assert.equal(malformed.status, 400);

  const ok = await request(app).post("/api/v1/auth/password-reset/verify").send({ email: user.email, code: "123456" });
  assert.equal(ok.status, 200);

  const newPassword = "NovaSenha123";
  const confirmed = await request(app).post("/api/v1/auth/password-reset/confirm").send({ email: user.email, code: "123456", password: newPassword });
  assert.equal(confirmed.status, 200);
  assert.ok(confirmed.body.token);

  const reused = await request(app).post("/api/v1/auth/password-reset/confirm").send({ email: user.email, code: "123456", password: "OutraSenha123" });
  assert.equal(reused.status, 400);

  const oldLogin = await request(app).post("/api/v1/auth/login").send({ email: user.email, password: user.password });
  assert.equal(oldLogin.status, 401);
  const newLogin = await request(app).post("/api/v1/auth/login").send({ email: user.email, password: newPassword });
  assert.equal(newLogin.status, 200);
});

test("5 códigos errados invalidam o código", async () => {
  const user = await registerTestUser(app);
  await plantCode(user.email, "111111");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await request(app).post("/api/v1/auth/password-reset/verify").send({ email: user.email, code: "999999" });
  }
  const right = await request(app).post("/api/v1/auth/password-reset/verify").send({ email: user.email, code: "111111" });
  assert.equal(right.status, 400);
});
