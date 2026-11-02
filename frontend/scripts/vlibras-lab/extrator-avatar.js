// Experimento VLibras × câmera — extrai os pontos das mãos e do corpo do avatar do VLibras.
// Roda NA PÁGINA do player (https://vlibras.gov.br/app/unity/index.html), onde o canvas do avatar pode ser
// lido: o app não consegue, porque lá o avatar fica num iframe de outro site. Para cada glosa, o avatar
// sinaliza (PlayerManager.playNow), o canvas é gravado e o MediaPipe (mesma versão e mesmos modelos do app)
// acha mãos e pose em cada quadro.
// Como os pontos chegam ao app: o navegador bloqueia a página do VLibras de chamar o computador local, então
// no fim levarParaOApp() compacta tudo (gzip) e abre o laboratório do app com o pacote no endereço (#...?pacote=).
// Uso: abra a página do player, cole este arquivo no console e chame
//   await extrairTudo(["A", "B", "OI"]);  await levarParaOApp();
const MEDIAPIPE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1";
const MODELO_MAO = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const MODELO_POSE = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const LABORATORIO = "http://localhost:5173/#/laboratorio";
const LIMITE_MS = 12000;
const SOBRA_MS = 250;
// Pontos da pose que o modelo de sinais do app usa (engine/dinamicos.js: CORPO + punhos); os outros viram null.
const POSE_USADA = new Set([0, 2, 5, 9, 10, 11, 12, 13, 14, 15, 16]);

const arred = (v) => Math.round(v * 1000) / 1000;

/** Carrega o MediaPipe e liga o vídeo ao canvas do avatar (uma vez). */
async function preparar() {
  if (window.__lab) return window.__lab;
  const { FilesetResolver, HandLandmarker, PoseLandmarker } = await import(`${MEDIAPIPE}/vision_bundle.mjs`);
  const fs = await FilesetResolver.forVisionTasks(`${MEDIAPIPE}/wasm`);
  const maos = await HandLandmarker.createFromOptions(fs, {
    baseOptions: { modelAssetPath: MODELO_MAO, delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });
  const pose = await PoseLandmarker.createFromOptions(fs, {
    baseOptions: { modelAssetPath: MODELO_POSE, delegate: "GPU" },
    runningMode: "VIDEO",
    numPoses: 1,
  });
  const canvas = document.querySelector("canvas");
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = canvas.captureStream(30);
  await video.play();
  const eventos = window.__eventosUnity ?? [];
  if (!window.__eventosUnity) {
    window.addEventListener("message", (e) => {
      if (e.data?.type === "unity_event") eventos.push({ evento: e.data.event, dados: e.data.data });
    });
  }
  window.__lab = { maos, pose, video, canvas, eventos, ts: 0, sinais: {} };
  return window.__lab;
}

/**
 * Faz o avatar sinalizar a glosa e guarda os pontos de cada quadro NOVO do vídeo enquanto ele sinaliza.
 * Usa um temporizador (não requestVideoFrameCallback): funciona também em aba de fundo ou sem janela.
 */
async function gravar(glosa) {
  const lab = await preparar();
  const quadros = [];
  let comecou = false;
  let terminouEm = null;
  let ultimoTempoDoVideo = -1;
  const inicio = performance.now();
  const marca = lab.eventos.length;

  await new Promise((resolve) => {
    const timer = setInterval(() => {
      const agora = performance.now();
      const novos = lab.eventos.slice(marca).filter((e) => e.evento === "on_playing_state_change");
      const tocando = novos.length > 0 && novos.at(-1).dados[0] === "True";
      if (tocando) comecou = true;
      if (comecou && !tocando && terminouEm === null) terminouEm = agora;
      const quadroNovo = lab.video.readyState >= 2 && lab.video.currentTime !== ultimoTempoDoVideo;
      if (comecou && quadroNovo) {
        ultimoTempoDoVideo = lab.video.currentTime;
        lab.ts = Math.max(Math.round(agora), lab.ts + 1);
        const rm = lab.maos.detectForVideo(lab.video, lab.ts);
        const rp = lab.pose.detectForVideo(lab.video, lab.ts);
        quadros.push({
          t: Math.round(agora - inicio),
          maos: (rm.landmarks ?? []).map((pontos, i) => ({
            lado: rm.handedness?.[i]?.[0]?.categoryName ?? null,
            score: arred(rm.handedness?.[i]?.[0]?.score ?? 0),
            p: pontos.map((p) => [arred(p.x), arred(p.y), arred(p.z)]),
          })),
          pose: rp.landmarks?.[0]?.map((p, k) => (POSE_USADA.has(k) ? [arred(p.x), arred(p.y), arred(p.z), arred(p.visibility ?? 1)] : null)) ?? null,
        });
      }
      if ((terminouEm !== null && agora - terminouEm > SOBRA_MS) || agora - inicio > LIMITE_MS) {
        clearInterval(timer);
        resolve();
      }
    }, 15);
    getUnityInstance().SendMessage("PlayerManager", "playNow", glosa);
  });

  lab.sinais[glosa] = { largura: lab.canvas.width, altura: lab.canvas.height, quadros };
  return { glosa, quadros: quadros.length, comMao: quadros.filter((q) => q.maos.length > 0).length, duracaoMs: quadros.at(-1)?.t ?? 0 };
}

/** Grava várias glosas em sequência (com uma pausa entre elas para o avatar voltar à posição). */
async function extrairTudo(glosas) {
  const resultados = [];
  for (const glosa of glosas) {
    resultados.push(await gravar(glosa));
    await new Promise((r) => setTimeout(r, 800));
  }
  return resultados;
}

/** Compacta (gzip + base64url) tudo o que foi gravado e abre o laboratório do app com o pacote. */
async function levarParaOApp() {
  const texto = JSON.stringify({ sinais: window.__lab?.sinais ?? {} });
  const gz = await new Response(new Blob([texto]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  let bin = "";
  new Uint8Array(gz).forEach((b) => { bin += String.fromCharCode(b); });
  const pacote = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const destino = `${LABORATORIO}?pacote=${pacote}`;
  location.href = destino;
  return { bytesJson: texto.length, bytesPacote: pacote.length };
}

window.extrairTudo = extrairTudo;
window.gravarGlosa = gravar;
window.levarParaOApp = levarParaOApp;
