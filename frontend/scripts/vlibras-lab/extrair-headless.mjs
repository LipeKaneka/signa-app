// Experimento VLibras × câmera — roda a extração do avatar num Chrome sem janela (headless).
// Numa aba visível o navegador desacelera o avatar quando a janela fica escondida; sem janela ele roda em tempo
// real. O Chrome é controlado pelo protocolo de depuração (CDP) com o WebSocket do próprio Node (sem dependências).
// Grava scripts/vlibras-lab/dados/avatar-pontos.json, lido pela página /laboratorio (só em npm run dev; fica fora do build).
// Uso: node scripts/vlibras-lab/extrair-headless.mjs [GLOSA ...]   (sem glosas: letras + 20 sinais MINDS-Libras)
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PLAYER_URL = "https://vlibras.gov.br/app/unity/index.html?v=7.12.2";
const PORT = 9333;
const OUTPUT = new URL("./dados/avatar-pontos.json", import.meta.url);
const EXTRACTOR = new URL("./extrator-avatar.js", import.meta.url);
const BROWSERS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];
const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "Ç"];
// Os 20 sinais do modelo de sinais com movimento do app (public/modelos/sinais-dinamicos.json), como glosas.
const MINDS = ["ACONTECER", "ALUNO", "AMARELO", "AMÉRICA", "APROVEITAR", "BALA", "BANCO", "BANHEIRO", "BARULHO", "CINCO",
  "CONHECER", "ESPELHO", "ESQUINA", "FILHO", "MAÇÃ", "MEDO", "RUIM", "SAPO", "VACINA", "VONTADE"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Conexão CDP mínima: send(method, params) → resultado. */
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (!message.id || !pending.has(message.id)) return;
      const { ok, fail } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) fail(new Error(message.error.message));
      else ok(message.result);
    };
    socket.onerror = () => reject(new Error("não conectou ao Chrome"));
    socket.onopen = () =>
      resolve({
        send: (method, params = {}) =>
          new Promise((ok, fail) => {
            id += 1;
            pending.set(id, { ok, fail });
            socket.send(JSON.stringify({ id, method, params }));
          }),
        close: () => socket.close(),
      });
  });
}

/** Avalia uma expressão na página (aguarda promessas) e devolve o valor. */
async function evaluate(page, expression) {
  const { result, exceptionDetails } = await page.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value;
}

async function main() {
  const glosas = process.argv.slice(2).length ? process.argv.slice(2) : [...LETTERS, ...MINDS];
  const browser = BROWSERS.find((path) => existsSync(path));
  if (!browser) throw new Error("Chrome/Edge não encontrado");
  const profile = await mkdtemp(join(tmpdir(), "vlibras-lab-"));
  const chrome = spawn(browser, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--window-size=1100,860",
    "--autoplay-policy=no-user-gesture-required",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ], { stdio: "ignore" });

  try {
    let target = null;
    for (let i = 0; i < 40 && !target; i += 1) {
      await sleep(250);
      target = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json()).then((list) => list.find((t) => t.type === "page")).catch(() => null);
    }
    if (!target) throw new Error("o Chrome não abriu a porta de depuração");
    const page = await connect(target.webSocketDebuggerUrl);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    // Guarda os avisos do player desde o início (o "player carregado" chega antes de dar tempo de escutar).
    await page.send("Page.addScriptToEvaluateOnNewDocument", {
      source: "window.__eventosUnity=[];addEventListener('message',e=>{if(e.data&&e.data.type==='unity_event')window.__eventosUnity.push({evento:e.data.event,dados:e.data.data})});",
    });
    await page.send("Page.navigate", { url: PLAYER_URL });
    console.log("Abrindo o player do VLibras…");
    const loaded = await evaluate(page, `new Promise(r=>{const t0=Date.now();const i=setInterval(()=>{const ok=(window.__eventosUnity||[]).some(e=>e.evento==='on_load_player');if(ok||Date.now()-t0>120000){clearInterval(i);r(ok)}},250)})`);
    if (!loaded) throw new Error("o player do VLibras não carregou em 2 minutos");
    await sleep(3000); // boas-vindas do avatar

    await evaluate(page, await readFile(EXTRACTOR, "utf8"));
    await evaluate(page, "preparar().then(()=>true)");
    // Aquecimento descartado: o primeiro sinal sai lento (modelos e player ainda carregando).
    await evaluate(page, `gravarGlosa("OI").then(()=>true)`);
    const data = { origem: "VLibras 7.12.2 (avatar Ícaro), extraído com MediaPipe tasks-vision 1.1.1 num Chrome sem janela", sinais: {} };
    try {
      data.sinais = JSON.parse(await readFile(OUTPUT, "utf8")).sinais ?? {};
    } catch {
      // primeira extração
    }
    for (const glosa of glosas) {
      const result = await evaluate(page, `gravarGlosa(${JSON.stringify(glosa)})`);
      data.sinais[glosa] = await evaluate(page, `window.__lab.sinais[${JSON.stringify(glosa)}]`);
      console.log(`${glosa}: ${result.quadros} quadros, ${result.comMao} com mão, ${result.duracaoMs} ms`);
      await sleep(700);
    }
    data.atualizado = new Date().toISOString();
    await mkdir(new URL("./", OUTPUT), { recursive: true });
    await writeFile(OUTPUT, JSON.stringify(data));
    console.log(`Salvo em scripts/vlibras-lab/dados/avatar-pontos.json (${Object.keys(data.sinais).length} sinais)`);
    page.close();
  } finally {
    chrome.kill();
    await sleep(500);
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error("Falhou:", error.message);
  process.exitCode = 1;
});
