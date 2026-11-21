import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";

// Atualização automática do APK: o servidor confere a release mais recente do GitHub e aplica sozinho se for nova.
let memoryServer;
let disconnectDatabase;
let syncAppUpdateFromGithub;
let getSetting;
let setSetting;
const realFetch = globalThis.fetch;
let release;
let apiBlocked = false;
let apkExists = true;
let history = "";

before(async () => {
  memoryServer = await MongoMemoryServer.create();
  Object.assign(process.env, { NODE_ENV: "test", DATABASE_URL: memoryServer.getUri(), SERVICE_KEY: randomBytes(48).toString("hex"), BREVO_API_KEY: "", MAILTRAP_API_TOKEN: "", GOOGLE_CLIENT_IDS: "" });
  globalThis.fetch = async (url, options) => {
    const address = String(url);
    if (address.startsWith("https://api.github.com/")) {
      return apiBlocked ? new Response("{\"message\":\"API rate limit exceeded\"}", { status: 403 }) : new Response(JSON.stringify(release), { status: 200 });
    }
    if (address.startsWith("https://raw.githubusercontent.com/")) return new Response(history, { status: 200 });
    if (address.startsWith("https://github.com/") && options?.method === "HEAD") return new Response(null, { status: apkExists ? 200 : 404 });
    return realFetch(url, options);
  };
  const database = await import("../src/database/database.js");
  await database.connectDatabase(process.env.DATABASE_URL);
  disconnectDatabase = database.disconnectDatabase;
  ({ syncAppUpdateFromGithub } = await import("../src/services/service-app-update-sync.js"));
  ({ getSetting, setSetting } = await import("../src/services/service-settings.js"));
});

after(async () => {
  globalThis.fetch = realFetch;
  await disconnectDatabase();
  await memoryServer.stop();
});

const apk = (name) => ({ name, browser_download_url: `https://github.com/dono/app/releases/download/${name}` });

test("release nova com APK e versionCode: aplica nome, link, novidades e número", async () => {
  release = { tag_name: "v1.8.0", name: "Signa 1.8.0", body: "Pop-ups novos\n\nversionCode: 19", assets: [apk("Signa-1.8.0.apk")] };
  assert.equal(await syncAppUpdateFromGithub(), 19);
  assert.equal(await getSetting("app.update.latestVersionCode"), 19);
  assert.equal(await getSetting("app.update.versionName"), "1.8");
  assert.equal(await getSetting("app.update.downloadUrl"), "https://github.com/dono/app/releases/download/Signa-1.8.0.apk");
  assert.equal(await getSetting("app.update.notes"), "Pop-ups novos");
  // A mesma release de novo: nada muda.
  assert.equal(await syncAppUpdateFromGithub(), null);
});

test("release mais velha, sem APK ou com a sincronização desligada: não mexe", async () => {
  release = { tag_name: "v1.7.0", body: "versionCode: 16", assets: [apk("Signa-1.7.0.apk")] };
  assert.equal(await syncAppUpdateFromGithub(), null);
  release = { tag_name: "v1.9.0", body: "versionCode: 20", assets: [] };
  assert.equal(await syncAppUpdateFromGithub(), null);
  await setSetting("app.update.autoFromGithub", 0);
  release = { tag_name: "v1.9.0", body: "versionCode: 20", assets: [apk("Signa-1.9.0.apk")] };
  assert.equal(await syncAppUpdateFromGithub(), null);
  assert.equal(await getSetting("app.update.latestVersionCode"), 19);
});

test("API do GitHub recusando (limite por IP): aplica pelo releases/HISTORICO.md, se o APK existir", async () => {
  await setSetting("app.update.autoFromGithub", 1);
  apiBlocked = true;
  history = [
    "| Versão | Data | versionCode | Tag | O que mudou |",
    "|---|---|---|---|---|",
    "| **2.0.0** | 22/11/2026 | 21 | `v2.0.0` | Tudo novo |",
    "| **1.8.0** | 21/11/2026 | 19 | `v1.8.0` | x |",
  ].join("\n");
  apkExists = false;
  assert.equal(await syncAppUpdateFromGithub(), null); // APK ainda não publicado: espera
  apkExists = true;
  assert.equal(await syncAppUpdateFromGithub(), 21);
  assert.equal(await getSetting("app.update.versionName"), "2.0");
  assert.equal(await getSetting("app.update.downloadUrl"), "https://github.com/LipeKaneka/signa-app/releases/download/v2.0.0/Signa-2.0.0.apk");
  assert.equal(await getSetting("app.update.notes"), "Tudo novo");
  apiBlocked = false;
});
