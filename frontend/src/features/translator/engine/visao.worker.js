// Detecção (MediaPipe) numa thread separada: a tela e a câmera continuam fluidas no
// celular enquanto o detector trabalha. Recebe quadros como ImageBitmap e devolve só os
// pontos. Mesma lógica de engine/maos.js (duas mãos sempre e pose em quadros alternados),
// para o resultado ser o mesmo nas duas formas de rodar.
import {FilesetResolver, HandLandmarker, PoseLandmarker} from '@mediapipe/tasks-vision'

// Num worker do tipo módulo não existe importScripts, e o MediaPipe cai num import() que não
// registra o runtime (erro "ModuleFactory not set"). O próprio MediaPipe aceita um carregador
// em self.import: baixamos o script do runtime e o executamos no escopo global do worker.
self.import = async url => {
  const codigo = await (await fetch(url)).text()
  ;(0, eval)(codigo)
}

let det = null

const POSE_A_CADA = 3

async function iniciar({wasm, modeloMao, modeloPose, corpo, delegado, opcoesMao}) {
  const fs = await FilesetResolver.forVisionTasks(wasm)
  const base = m => ({modelAssetPath: m, delegate: delegado})
  const maos = await HandLandmarker.createFromOptions(fs, {baseOptions: base(modeloMao), runningMode: 'VIDEO', ...opcoesMao})
  const pose = corpo
    ? await PoseLandmarker.createFromOptions(fs, {baseOptions: base(modeloPose), runningMode: 'VIDEO', numPoses: 1,
        minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5})
    : null
  det = {maos, pose, corpo, ultimaPose: null, quadro: 0, ts: 0}
}

async function detectar(bitmap, ts) {
  det.ts = Math.max(ts, det.ts + 1)
  const t0 = performance.now()
  let pose = null
  if (det.corpo) {
    if (det.quadro++ % POSE_A_CADA === 0 || !det.ultimaPose) det.ultimaPose = det.pose.detectForVideo(bitmap, det.ts).landmarks?.[0] ?? null
    pose = det.ultimaPose
  }
  const rm = det.maos.detectForVideo(bitmap, det.ts)
  bitmap.close()
  return {rm: {landmarks: rm.landmarks, worldLandmarks: rm.worldLandmarks, handedness: rm.handedness}, pose, ms: performance.now() - t0}
}

self.onmessage = async ({data}) => {
  try {
    if (data.tipo === 'iniciar') {
      await iniciar(data)
      self.postMessage({tipo: 'pronto'})
    } else if (data.tipo === 'quadro') {
      self.postMessage({tipo: 'resultado', id: data.id, ...(await detectar(data.bitmap, data.ts))})
    }
  } catch (e) {
    data.bitmap?.close?.()
    self.postMessage({tipo: 'erro', id: data.id, mensagem: String(e?.message || e)})
  }
}
