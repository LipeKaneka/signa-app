// Detecção na thread principal (só quando o navegador não tem Web Worker): carregado sob demanda por
// detectorRemoto.js, para o MediaPipe (~900 KB) não entrar no carregamento da tela da câmera.
import {FilesetResolver, HandLandmarker, PoseLandmarker} from '@mediapipe/tasks-vision'
import {MODELO, MODELO_POSE, OPCOES_MAO, WASM} from './maos'

const cache = {}

/** Cria (uma vez por modo) o detector. modo: 'VIDEO' para câmera, 'IMAGE' para fotos. */
export function detector(modo = 'VIDEO') {
  cache[modo] ??= (async () => {
    const fs = await FilesetResolver.forVisionTasks(WASM)
    const opts = {runningMode: modo, ...OPCOES_MAO}
    // CPU: funciona em qualquer aparelho
    // (o delegado GPU travou em alguns navegadores durante os testes).
    return HandLandmarker.createFromOptions(fs, {baseOptions: {modelAssetPath: MODELO, delegate: 'CPU'}, ...opts})
  })()
  return cache[modo]
}

// Sinais com movimento: duas mãos + corpo (pose), com as mesmas opções usadas no treino (ml/config.py).
let corpo = null
export function detectorCorpo() {
  corpo ??= (async () => {
    const fs = await FilesetResolver.forVisionTasks(WASM)
    const [maos, pose] = await Promise.all([
      HandLandmarker.createFromOptions(fs, {baseOptions: {modelAssetPath: MODELO, delegate: 'CPU'}, runningMode: 'VIDEO',
        ...OPCOES_MAO}),
      PoseLandmarker.createFromOptions(fs, {baseOptions: {modelAssetPath: MODELO_POSE, delegate: 'CPU'}, runningMode: 'VIDEO',
        numPoses: 1, minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5}),
    ])
    // Velocidade (medida no navegador, CPU): 2 mãos ~85 ms/quadro e a pose ~35 ms.
    // Por isso a pose roda só a cada POSE_A_CADA quadros (ver detectarCorpo).
    return {maos, pose, ultimaPose: null, quadro: 0}
  })()
  return corpo
}

const POSE_A_CADA = 3

/**
 * Mãos (até 2) e pose do quadro: {maos: [21 pontos][], pose: 33 pontos | null, rm}.
 * rm é o resultado bruto das mãos (com lateralidade), usado pelas letras.
 */
export function detectarCorpo(det, fonte) {
  ultimoTs = Math.max(performance.now(), ultimoTs + 1)
  if (det.quadro++ % POSE_A_CADA === 0 || !det.ultimaPose) {
    det.ultimaPose = det.pose.detectForVideo(fonte, ultimoTs).landmarks?.[0] ?? null
  }
  const pose = det.ultimaPose
  const rm = det.maos.detectForVideo(fonte, ultimoTs)
  return {maos: rm.landmarks ?? [], pose, rm}
}

// O modo VIDEO exige carimbos de tempo estritamente crescentes (o detector é
// compartilhado entre telas, então o controle fica aqui).
let ultimoTs = 0
export function detectarQuadro(det, fonte) {
  ultimoTs = Math.max(performance.now(), ultimoTs + 1)
  return det.detectForVideo(fonte, ultimoTs)
}
