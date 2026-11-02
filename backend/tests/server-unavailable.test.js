import { test, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import request from "supertest";

// Backend sem o servidor de gerenciamento no ar: o app precisa receber 503 com mensagem amigável,
// nunca 500 com detalhes nem 401 (que faria o app sair da conta).
let app;

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    SERVER_URL: "http://127.0.0.1:9/internal/v1",
    SERVER_SERVICE_KEY: randomBytes(48).toString("hex"),
    JWT_SECRET: randomBytes(64).toString("hex"),
    FRONTEND_URL: "http://localhost:5173",
  });
  const { createApp } = await import("../src/app.js");
  app = createApp();
});

test("login com servidor fora do ar responde 503 amigável", async () => {
  const response = await request(app).post("/api/v1/auth/login").send({ email: "alguem@exemplo.test", password: "senha12345" });
  assert.equal(response.status, 503);
  assert.match(response.body.error, /temporariamente indisponível/);
  assert.equal(response.body.details, undefined);
});

test("rota autenticada com servidor fora do ar responde 503, não 401", async () => {
  const { generateAccessToken } = await import("../src/utils/util-tokens.js");
  const token = generateAccessToken("0123456789abcdef01234567");
  const response = await request(app).get("/api/v1/trail").set({ Authorization: `Bearer ${token}` });
  assert.equal(response.status, 503);
});

test("health do backend não depende do servidor", async () => {
  const response = await request(app).get("/api/v1/health");
  assert.equal(response.status, 200);
});
