// Detecção de mãos no próprio aparelho com MediaPipe Hand Landmarker.
// Nenhuma imagem sai do dispositivo: só os 21 pontos de cada mão são usados.
import {FilesetResolver, HandLandmarker, PoseLandmarker} from '@mediapipe/tasks-vision'

// Runtime WebAssembly e modelos servidos pelo próprio app (public/mediapipe), para funcionar
// offline no APK. Modelos oficiais do Google (Apache-2.0), cópias de
// storage.googleapis.com/mediapipe-models/{hand_landmarker/hand_landmarker,pose_landmarker/pose_landmarker_lite}/float16/1/
export const WASM = './mediapipe/wasm'
export const MODELO = './mediapipe/modelos/hand_landmarker.task' 
export const MODELO_POSE = './mediapipe/modelos/pose_landmarker_lite.task'
// Confianças moderadas: valores altos (0,7+) perdiam letras de mão fechada (A, S, E, M, N).
// Mãos fantasmas são barradas depois, pelo filtro de formato e de presença contínua.
// Sempre procura as duas mãos: a principal soletra e a outra aparece na tela e entra nos sinais com movimento.
export const OPCOES_MAO = {numHands: 2, minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.5}

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

/** Mão usada para soletrar quando há duas: a de maior confiança. Mesmo formato de primeiraMao. */
export function maoPrincipal(r, scoreMinimo = 0) {
  if (!r?.landmarks?.length) return null
  let k = 0
  r.handedness.forEach((h, i) => { if ((h[0]?.score ?? 0) > (r.handedness[k][0]?.score ?? 0)) k = i })
  const h = r.handedness[k][0]
  if ((h?.score ?? 0) < scoreMinimo) return null
  return {pontos: r.landmarks[k], mundo: r.worldLandmarks?.[k] ?? null, lado: h?.categoryName ?? 'Right', score: h?.score ?? 0}
}

// O modo VIDEO exige carimbos de tempo estritamente crescentes (o detector é
// compartilhado entre telas, então o controle fica aqui).
let ultimoTs = 0
export function detectarQuadro(det, fonte) {
  ultimoTs = Math.max(performance.now(), ultimoTs + 1)
  return det.detectForVideo(fonte, ultimoTs)
}

/**
 * Primeira mão encontrada: {pontos: [{x,y,z}] x21, lado: 'Left'|'Right', score}.
 * O "lado" do MediaPipe considera a imagem espelhada (selfie); usamos só para normalizar.
 */
export const SCORE_MINIMO = 0.5

export function primeiraMao(r, scoreMinimo = 0) {
  if (!r?.landmarks?.length) return null
  const h = r.handedness?.[0]?.[0]
  const score = h?.score ?? 0
  if (score < scoreMinimo) return null
  // mundo: coordenadas 3D em metros (origem no centro da mão), bem mais estáveis
  // em profundidade que as coordenadas da imagem — usadas na classificação.
  return {pontos: r.landmarks[0], mundo: r.worldLandmarks?.[0] ?? null, lado: h?.categoryName ?? 'Right', score}
}

// Conexões entre pontos para desenhar o "esqueleto" da mão.
export const CONEXOES = HandLandmarker.HAND_CONNECTIONS.map(c => [c.start, c.end])
