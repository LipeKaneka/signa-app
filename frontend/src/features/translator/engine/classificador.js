// Classificação de sinais ESTÁTICOS (configurações de mão) a partir dos 21 pontos
// do MediaPipe. Ideia de partida: SignForest (MIT) — pontos da mão viram um vetor
// de características. Aqui as características são invariantes a posição, tamanho
// e rotação da mão no plano da imagem (ângulos dos dedos e distâncias relativas),
// e a classificação usa k vizinhos mais próximos (k-NN), que aprende na hora com
// poucas amostras — o que permite "ensinar" novos sinais no app.
import base from './amostras-base.json'

const CHAVE = 'signa:libras-amostras-v2'

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norma = a => Math.sqrt(dot(a, a))
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/**
 * Pontos 3D "do mundo" (metros, do MediaPipe) com origem no punho e mão
 * esquerda espelhada. A profundidade é bem mais estável que a das coordenadas
 * da imagem, o que importa para descrever a mão no sistema da palma.
 */
export function pontosMundo(mundo, lado) {
  const s = lado === 'Left' ? -1 : 1
  const p0 = mundo[0]
  return mundo.map(p => [+(s * (p.x - p0.x)).toFixed(4), +(p.y - p0.y).toFixed(4), +(s * (p.z - p0.z)).toFixed(4)])
}

/**
 * Pontos "brutos" normalizados: origem no punho, x corrigido pelo aspecto da
 * imagem e mão esquerda espelhada para parecer direita. É o que guardamos nas
 * amostras (assim as características podem evoluir sem regravar nada).
 */
export function pontosNormalizados(pontos, lado, aspecto = 1) {
  const s = lado === 'Left' ? -1 : 1
  const p0 = pontos[0]
  return pontos.map(p => [+(s * (p.x - p0.x) * aspecto).toFixed(4), +(p.y - p0.y).toFixed(4), +(s * (p.z - p0.z) * aspecto).toFixed(4)])
}

const DEDOS = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]
// Articulações descritas no sistema da palma (todas menos punho e bases dos dedos, que definem a palma).
const PONTOS_DESCRITOS = [2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15, 16, 18, 19, 20]
// Distâncias da ponta do polegar: separam letras parecidas (A/S/E/O/C/M/N).
const ALVOS_POLEGAR = [8, 12, 16, 20, 6, 10]
// Pesos escolhidos por validação cruzada com 21 letras (ver README): orientação
// importa para P, Q, M e N; o polegar separa A/S/E/T/F.
const PESO_POLEGAR = 2.25
const PESO_ORIENTACAO = 1

/**
 * Vetor de características (54 valores), invariante a posição, tamanho e
 * rotação da mão (comparado em testes com várias alternativas; ver README):
 * - 45: posição 3D de 15 articulações num sistema de eixos preso à palma
 *   (y: punho→base do dedo médio, z: normal da palma), em unidades de palma;
 * - 6: distância da ponta do polegar às pontas/meios dos outros dedos;
 * - 3: orientação da mão na imagem (peso menor), para sinais que só mudam a orientação.
 * escala: ajuste por dedo do perfil (perfil.js), aplicado às distâncias do polegar.
 */
export function caracteristicas(P, escala = null) {
  const e = escala ?? [1, 1, 1, 1, 1]
  const o = P[0]
  const palma = norma(sub(P[9], o)) || 1
  const ey = sub(P[9], o).map(x => x / palma)
  const n = cross(sub(P[5], o), sub(P[17], o))
  const nn = norma(n) || 1
  const ez = n.map(x => x / nn)
  const ex = cross(ey, ez)
  const f = []
  for (const i of PONTOS_DESCRITOS) {
    const v = sub(P[i], o).map(x => x / palma)
    f.push(dot(v, ex), dot(v, ey), dot(v, ez))
  }
  ALVOS_POLEGAR.forEach((t, k) => {
    const dedo = k < 4 ? k + 1 : k - 3 // índice do dedo do alvo (1=indicador...)
    f.push((norma(sub(P[4], P[t])) / palma) * PESO_POLEGAR * ((e[0] + e[dedo]) / 2))
  })
  const up = sub(P[9], o)
  const nu = Math.hypot(up[0], up[1]) || 1
  f.push((up[0] / nu) * PESO_ORIENTACAO, (up[1] / nu) * PESO_ORIENTACAO, ez[2] * PESO_ORIENTACAO)
  return f
}

/**
 * Comprimento de cada dedo (soma dos segmentos, da base à ponta) dividido pelo
 * tamanho da palma. Não muda quando o dedo dobra, então serve para medir a
 * anatomia da mão em qualquer pose.
 */
export function comprimentosDedos(P) {
  const palma = norma(sub(P[9], P[0])) || 1
  return DEDOS.map(([a, b, c, d]) => (norma(sub(P[b], P[a])) + norma(sub(P[c], P[b])) + norma(sub(P[d], P[c]))) / palma)
}

let referencia = null
/** Proporções médias dos dedos nas amostras de referência (base). */
export function proporcoesReferencia() {
  if (referencia) return referencia
  const xs = base.amostras.map(a => comprimentosDedos(a.p))
  referencia = xs[0].map((_, i) => xs.reduce((s, x) => s + x[i], 0) / xs.length)
  return referencia
}

const dist = (a, b) => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2
  return Math.sqrt(s)
}

// ---------- Amostras (base + ensinadas pelo usuário) ----------
// Cada amostra: {rotulo, p: 21 pontos normalizados}. O vetor "v" é calculado na carga.

function lerProprias() {
  try { return JSON.parse(localStorage.getItem(CHAVE)) || [] } catch { return [] }
}
function gravar(xs) {
  try { localStorage.setItem(CHAVE, JSON.stringify(xs)) } catch {}
}
// Amostras do próprio usuário passam pelo mesmo ajuste de proporções que os quadros ao vivo.
export const amostrasBase = () => base.amostras.map(a => ({...a, origem: 'base', v: caracteristicas(a.p)}))
export const amostrasProprias = (escala = null) => lerProprias().map(a => ({...a, origem: a.cal ? 'calibracao' : 'propria', v: caracteristicas(a.p, escala)}))
export const todasAmostras = (escala = null) => [...amostrasBase(), ...amostrasProprias(escala)]

/** extra.cal = true marca amostras gravadas na análise da mão (substituídas ao refazer a análise). */
export function adicionarAmostras(rotulo, listaPontos, extra = {}) {
  gravar([...lerProprias(), ...listaPontos.map(p => ({rotulo, p, ...extra}))])
}
export function removerCalibracao() {
  gravar(lerProprias().filter(a => !a.cal))
}
export function removerRotulo(rotulo) {
  gravar(lerProprias().filter(a => a.rotulo !== rotulo))
}
export function exportarProprias() {
  return JSON.stringify({formato: 'signa-libras-amostras', versao: 2, amostras: lerProprias()})
}
export function importarProprias(texto) {
  const d = JSON.parse(texto)
  const ok = d?.versao === 2 && Array.isArray(d.amostras) && d.amostras.every(a => typeof a.rotulo === 'string' && Array.isArray(a.p) && a.p.length === 21)
  if (!ok) throw new Error('Arquivo inválido (use um arquivo exportado por esta versão do app)')
  gravar([...lerProprias(), ...d.amostras])
  return d.amostras.length
}

/** Quantidade de amostras por rótulo. */
export function contagem(amostras = todasAmostras()) {
  const c = {}
  for (const a of amostras) c[a.rotulo] = (c[a.rotulo] || 0) + 1
  return c
}

// ---------- Classificação ----------

/** Distância acima da qual consideramos que o gesto não se parece com nada conhecido. */
// Calibrado por validação cruzada em blocos com as 21 letras (fotos de celular de
// outra pessoa): com 2,2, ~92% dos gestos são aceitos e ~84% dos aceitos estão
// certos por quadro; a exigência de vários quadros iguais seguidos (escrita.js)
// filtra boa parte dos erros restantes.
export const LIMIAR_DESCONHECIDO = 2.2

/**
 * k-NN com voto ponderado. Devolve {rotulo, confianca (0–1), distancia, maisParecido}.
 * rotulo é null quando o gesto está longe de todas as amostras; maisParecido
 * sempre indica o sinal mais próximo (útil para diagnóstico).
 */
// Amostras da própria pessoa valem mais no voto: representam a mão dela.
const PESO_PESSOAL = 2

export function classificar(vetor, amostras, k = 5, limiar = LIMIAR_DESCONHECIDO) {
  if (!amostras.length) return {rotulo: null, confianca: 0, distancia: Infinity, maisParecido: null}
  const viz = amostras
    .map(a => ({r: a.rotulo, d: dist(vetor, a.v), w: a.origem === 'base' ? 1 : PESO_PESSOAL}))
    .sort((a, b) => a.d - b.d)
    .slice(0, k)
  const votos = {}
  for (const n of viz) votos[n.r] = (votos[n.r] || 0) + n.w / (n.d + 1e-3)
  const total = Object.values(votos).reduce((s, x) => s + x, 0)
  const [rotulo, peso] = Object.entries(votos).sort((a, b) => b[1] - a[1])[0]
  const distancia = viz.find(n => n.r === rotulo).d
  const conhecido = distancia <= limiar
  // Três candidatos mais próximos (um por letra), para o diagnóstico.
  const top = []
  for (const a of amostras.map(a => ({r: a.rotulo, d: dist(vetor, a.v)})).sort((a, b) => a.d - b.d)) {
    if (!top.some(t => t.r === a.r)) top.push(a)
    if (top.length === 3) break
  }
  return {rotulo: conhecido ? rotulo : null, confianca: conhecido ? peso / total : 0, distancia, maisParecido: rotulo, top}
}
