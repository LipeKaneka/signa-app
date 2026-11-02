// Experimento VLibras × câmera — guarda em disco os pontos do avatar que chegaram à página /laboratorio.
// A página do laboratório (http://localhost:5173) recebe os pontos da janela do player por postMessage e manda
// para cá; o arquivo scripts/vlibras-lab/dados/avatar-pontos.json é recarregado na próxima vez que o laboratório abrir.
// Uso: node scripts/vlibras-lab/receptor.mjs   (porta 8765, só em 127.0.0.1; Ctrl+C para parar)
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const PORT = 8765;
const ALLOWED_ORIGIN = "http://localhost:5173";
const OUTPUT = new URL("./dados/avatar-pontos.json", import.meta.url);
const MAX_BODY_BYTES = 20 * 1024 * 1024;

/** Lê o arquivo atual (ou começa vazio). */
async function readCurrent() {
  try {
    return JSON.parse(await readFile(OUTPUT, "utf8"));
  } catch {
    return { origem: "VLibras (avatar Ícaro), extraído com MediaPipe", sinais: {} };
  }
}

/** Cabeçalhos para a página do laboratório (outra porta) poder mandar os pontos. */
function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}

createServer(async (req, res) => {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  if (req.method !== "POST" || req.headers.origin !== ALLOWED_ORIGIN) return res.writeHead(403).end();

  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return res.writeHead(413).end();
    chunks.push(chunk);
  }
  try {
    const { glosa, quadros, largura, altura } = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (typeof glosa !== "string" || !Array.isArray(quadros)) throw new Error("formato inválido");
    const current = await readCurrent();
    current.sinais[glosa] = { largura, altura, quadros };
    current.atualizado = new Date().toISOString();
    await mkdir(new URL("./", OUTPUT), { recursive: true });
    await writeFile(OUTPUT, JSON.stringify(current));
    console.log(`${glosa}: ${quadros.length} quadros salvos`);
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true }));
  } catch (error) {
    res.writeHead(400).end(String(error.message));
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Receptor do laboratório VLibras em http://127.0.0.1:${PORT}`));
