import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startTestApp, stopTestApp, registerTestUser, authorized } from "./helpers.js";

// Pop-ups no contrato do app: /app-config traz avisos e manutenção; durante a manutenção, a conta não liberada
// recebe 503 {code: "maintenance", maintenance} (o app mostra o pop-up e fecha) e a liberada usa normalmente.
let app;
let MaintenanceModel;
let clearPopupsCache;
let clearContentCache;

before(async () => {
  app = await startTestApp();
  ({ MaintenanceModel } = await import("../../server/src/models/model-maintenance.js"));
  ({ clearPopupsCache } = await import("../../server/src/services/service-popups.js"));
  ({ clearContentCache } = await import("../src/clients/content-cache.js"));
});

after(stopTestApp);

async function setMaintenance(fields) {
  await MaintenanceModel.updateOne({ key: "main" }, { $set: fields }, { upsert: true });
  clearPopupsCache();
  clearContentCache();
}

test("manutenção: 503 maintenance com os textos do pop-up para quem não está liberado; liberado passa", async () => {
  const student = await registerTestUser(app);
  const staff = await registerTestUser(app);
  await setMaintenance({ enabled: true, startsAt: null, endsAt: null, title: "Já voltamos", allowedEmails: [staff.email.toLowerCase()] });

  const config = await request(app).get("/api/v1/app-config");
  assert.equal(config.status, 200);
  assert.equal(config.body.popups.maintenance.active, true);
  assert.equal(config.body.popups.maintenance.title, "Já voltamos");
  assert.ok(Array.isArray(config.body.popups.announcements));

  const blocked = await request(app).get("/api/v1/profile").set(authorized(student.token));
  assert.equal(blocked.status, 503);
  assert.equal(blocked.body.code, "maintenance");
  assert.equal(blocked.body.maintenance.title, "Já voltamos");
  assert.equal(blocked.body.maintenance.buttonText, "Fechar o app");

  const login = await request(app).post("/api/v1/auth/login").send({ email: student.email, password: student.password });
  assert.equal(login.status, 503);
  assert.equal(login.body.code, "maintenance");
  // O texto da manutenção chega ao app (não o "Erro interno" genérico dos erros 500).
  assert.equal(login.body.error, "O Signa Ludus está em manutenção para ficar ainda melhor. Volte daqui a pouco!");

  const allowed = await request(app).get("/api/v1/profile").set(authorized(staff.token));
  assert.equal(allowed.status, 200);

  await setMaintenance({ enabled: false });
  const back = await request(app).get("/api/v1/profile").set(authorized(student.token));
  assert.equal(back.status, 200);
});
