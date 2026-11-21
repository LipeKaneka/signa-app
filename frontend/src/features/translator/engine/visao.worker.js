// Detecção (MediaPipe) numa thread separada: a tela e a câmera continuam fluidas no
// celular enquanto o detector trabalha. Recebe quadros como ImageBitmap e devolve só os
// pontos. Mesma lógica de engine/maos-local.js (duas mãos sempre e pose em quadros alternados),
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

const criarPose = (fs, modeloPose, delegado) => PoseLandmarker.createFromOptions(fs, {
  baseOptions: {modelAssetPath: modeloPose, delegate: delegado}, runningMode: 'VIDEO', numPoses: 1,
  minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5})

async function iniciar({wasm, modeloMao, modeloPose, corpo, delegado, opcoesMao}) {
  const fs = await FilesetResolver.forVisionTasks(wasm)
  const maos = await HandLandmarker.createFromOptions(fs, {baseOptions: {modelAssetPath: modeloMao, delegate: delegado}, runningMode: 'VIDEO', ...opcoesMao})
  const pose = corpo ? await criarPose(fs, modeloPose, delegado) : null
  det = {fs, modeloPose, delegado, maos, pose, corpo, ultimaPose: null, quadro: 0, ts: 0}
}

/** Liga ou desliga a pose sem recriar o detector (trocar o modo da câmera não reabre nada). */
async function definirCorpo(corpo) {
  if (corpo && !det.pose) det.pose = await criarPose(det.fs, det.modeloPose, det.delegado)
  det.corpo = corpo
  det.ultimaPose = null
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
    } else if (data.tipo === 'corpo') {
      await definirCorpo(data.corpo)
      self.postMessage({tipo: 'corpo', id: data.id})
    } else if (data.tipo === 'quadro') {
      self.postMessage({tipo: 'resultado', id: data.id, ...(await detectar(data.bitmap, data.ts))})
    }
  } catch (e) {
    data.bitmap?.close?.()
    self.postMessage({tipo: 'erro', id: data.id, mensagem: String(e?.message || e)})
  }
}
