// Detecção de mãos no próprio aparelho com MediaPipe Hand Landmarker.
// Nenhuma imagem sai do dispositivo: só os 21 pontos de cada mão são usados.
// Este arquivo não importa o MediaPipe: só constantes e funções leves (a tela da câmera carrega rápido).
// A detecção roda no worker (visao.worker.js); o modo sem worker fica em maos-local.js, carregado só se preciso.

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

/** Mão usada para soletrar quando há duas: a de maior confiança. Mesmo formato de primeiraMao. */
export function maoPrincipal(r, scoreMinimo = 0) {
  if (!r?.landmarks?.length) return null
  let k = 0
  r.handedness.forEach((h, i) => { if ((h[0]?.score ?? 0) > (r.handedness[k][0]?.score ?? 0)) k = i })
  const h = r.handedness[k][0]
  if ((h?.score ?? 0) < scoreMinimo) return null
  return {pontos: r.landmarks[k], mundo: r.worldLandmarks?.[k] ?? null, lado: h?.categoryName ?? 'Right', score: h?.score ?? 0}
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
// Mesma lista de HandLandmarker.HAND_CONNECTIONS (MediaPipe), escrita aqui para não carregar a biblioteca.
export const CONEXOES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]]
