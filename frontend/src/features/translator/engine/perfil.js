// Perfil da mão do usuário, montado na "análise da mão" antes de traduzir.
// Fica só no aparelho (localStorage).
import {comprimentosDedos, proporcoesReferencia} from './classificador'

const CHAVE = 'signa:libras-perfil'
export const NOMES_DEDOS = ['polegar', 'indicador', 'médio', 'anelar', 'mínimo']

/** Letras usadas no ajuste: as de menor acerto na validação com 21 letras (M/N/Q, P, R/U, T, E). */
export const LETRAS_AJUSTE = ['M', 'N', 'Q', 'P', 'R', 'U', 'T', 'E']

export function lerPerfil() {
  try { return JSON.parse(localStorage.getItem(CHAVE)) } catch { return null }
}
export function salvarPerfil(p) {
  try { localStorage.setItem(CHAVE, JSON.stringify(p)) } catch {}
}
export function apagarPerfil() {
  try { localStorage.removeItem(CHAVE) } catch {}
}

/**
 * Analisa vários quadros da mão aberta: proporções de cada dedo em relação à
 * média da base e o fator de ajuste usado nas características (limitado a
 * ±25% para um quadro ruim não distorcer tudo).
 */
export function analisarProporcoes(listaPontos) {
  const xs = listaPontos.map(comprimentosDedos)
  const media = xs[0].map((_, i) => xs.reduce((s, x) => s + x[i], 0) / xs.length)
  const ref = proporcoesReferencia()
  const relativo = media.map((m, i) => m / ref[i])
  const escala = relativo.map(r => Math.min(1.25, Math.max(0.8, 1 / r)))
  return {relativo, escala}
}

/** Mão real do usuário. O MediaPipe rotula supondo imagem espelhada; a câmera entrega a imagem crua. */
export const maoReal = lado => (lado === 'Left' ? 'direita' : 'esquerda')

/** Dedos esticados? (ângulo da articulação do meio perto de 180°) — confere a pose de mão aberta. */
export function maoAberta(mao) {
  const P = mao.pontos
  const ang = (a, b, c) => {
    const u = [P[a].x - P[b].x, P[a].y - P[b].y, P[a].z - P[b].z]
    const v = [P[c].x - P[b].x, P[c].y - P[b].y, P[c].z - P[b].z]
    const d = Math.hypot(...u) * Math.hypot(...v)
    return d ? Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / d))) : 0
  }
  return [[5, 6, 7], [9, 10, 11], [13, 14, 15], [17, 18, 19]].every(([a, b, c]) => ang(a, b, c) > 0.8 * Math.PI)
}

/** Caixa da mão no quadro (coordenadas 0–1): tamanho e centro, para checar enquadramento. */
export function caixaMao(mao) {
  const xs = mao.pontos.map(p => p.x)
  const ys = mao.pontos.map(p => p.y)
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  return {tamanho: Math.max(x1 - x0, y1 - y0), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2}
}

let tela = null
/** Brilho médio do quadro (0–255), numa versão reduzida da imagem. */
export function brilho(video) {
  tela ??= Object.assign(document.createElement('canvas'), {width: 32, height: 24})
  const g = tela.getContext('2d', {willReadFrequently: true})
  g.drawImage(video, 0, 0, 32, 24)
  const d = g.getImageData(0, 0, 32, 24).data
  let s = 0
  for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
  return s / (d.length / 4)
}

/** Média de vetores (suavização temporal das características). */
export function mediaVetores(vs) {
  return vs[0].map((_, i) => vs.reduce((s, v) => s + v[i], 0) / vs.length)
}

/**
 * A detecção parece uma mão humana de verdade? Descarta falsos positivos:
 * palma pequena/grande demais no quadro e dedos com proporções impossíveis.
 * Limites folgados: nas 1.209 amostras reais os dedos variam de 0,35 a 2,0
 * palmas (dedo apontado para a câmera parece curto), e nenhuma é rejeitada.
 * Devolve null se plausível, ou o motivo da rejeição.
 */
export function motivoImplausivel(mao, pontos, aspecto) {
  const p0 = mao.pontos[0], p9 = mao.pontos[9]
  const palmaQuadro = Math.hypot((p9.x - p0.x) * aspecto, p9.y - p0.y)
  if (palmaQuadro < 0.05) return 'mão muito longe ou pequena'
  if (palmaQuadro > 0.6) return 'mão muito perto'
  const c = comprimentosDedos(pontos)
  if (c.some(x => x < 0.25 || x > 2.4)) return 'formato não parece uma mão'
  return null
}

// Punho e bases dos dedos: tremem bem menos que as pontas dos dedos.
const PONTOS_PALMA = [0, 5, 9, 13, 17]

/** Quanto a mão se moveu entre dois quadros, em tamanhos de palma (média dos pontos da palma). */
export function movimento(antes, agora, aspecto) {
  if (!antes) return 0
  const palma = Math.hypot((agora[9].x - agora[0].x) * aspecto, agora[9].y - agora[0].y) || 1
  let s = 0
  for (const i of PONTOS_PALMA) s += Math.hypot((agora[i].x - antes[i].x) * aspecto, agora[i].y - antes[i].y)
  return s / PONTOS_PALMA.length / palma
}
