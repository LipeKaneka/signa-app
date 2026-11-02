// Letras (ou sinais curtos) COM MOVIMENTO feitos sem tirar a mão da imagem — H, J, K, X, Z, Ç.
// Nenhuma base pública usada no projeto tem gravações dessas letras em Libras, então elas
// são aprendidas com gravações reais da própria pessoa (aba Ensinar), como os sinais
// estáticos ensinados. A comparação usa DTW (alinhamento temporal dinâmico) sobre a
// trajetória da ponta do indicador e o formato da mão, com vizinho mais próximo.

const CHAVE = 'signa:libras-movimentos-v1'
export const PASSOS = 20
export const MIN_AMOSTRAS = 3
// Piso do limiar de DTW. Nos testes: mesmo gesto com pausas ≈ 0,07; movimento diferente ≈ 0,55.
const LIMIAR_MINIMO = 0.15

// ---------- Recorte do gesto ----------

/**
 * Detecta um gesto com movimento: começa quando a mão passa a se mexer e termina quando
 * ela fica parada por alguns quadros. push() devolve o gesto ({quadros}) ao terminar,
 * {curto: true} para movimentos pequenos demais, ou null.
 * quadro = {t, pontos (normalizados: origem no punho, espelhados, x corrigido pelo aspecto),
 *           punho: [x, y] no quadro (x corrigido e espelhado), movendo, parada}
 */
export class DetectorGesto {
  // Termina só depois de `paradoFim` s parado (por tempo, não por quadros: vale para qualquer
  // velocidade de câmera), para as pausas curtas nas quinas do Z não cortarem o gesto.
  constructor({paradoFim = 0.3, ausenciaMax = 0.25, duracaoMin = 0.25, caminhoMin = 1.2, duracaoMax = 3} = {}) {
    Object.assign(this, {paradoFim, ausenciaMax, duracaoMin, caminhoMin, duracaoMax})
    this.reiniciar()
  }

  reiniciar() {
    this.limpar()
    this.fim = -Infinity // quando o último gesto terminou (s)
  }

  limpar() {
    this.antes = []
    this.buf = null
    this.paradoDesde = null
    this.ausenteDesde = null
  }

  get ativo() { return !!this.buf }

  push(q) {
    if (!q) { // sem mão (q.t não existe: usa o relógio)
      const t = performance.now() / 1000
      if (this.buf) {
        this.ausenteDesde ??= t
        if (t - this.ausenteDesde > this.ausenciaMax) { this.limpar(); this.fim = t }
      } else this.antes = []
      return null
    }
    this.ausenteDesde = null
    if (!this.buf) {
      if (q.movendo) {
        this.buf = [...this.antes, q]
        this.antes = []
        this.paradoDesde = null
      } else {
        this.antes = [...this.antes, q].slice(-2)
      }
      return null
    }
    this.buf.push(q)
    if (q.parada) this.paradoDesde ??= {t: q.t, i: this.buf.length - 1}
    else this.paradoDesde = null
    const dur = q.t - this.buf[0].t
    if ((!this.paradoDesde || q.t - this.paradoDesde.t < this.paradoFim) && dur < this.duracaoMax) return null
    const quadros = this.paradoDesde ? this.buf.slice(0, this.paradoDesde.i + 1) : this.buf
    this.limpar()
    this.fim = q.t
    const d = quadros[quadros.length - 1].t - quadros[0].t
    if (d < this.duracaoMin || quadros.length < 5 || caminho(quadros) < this.caminhoMin) return {curto: true}
    return {quadros: reamostrarQuadros(quadros, PASSOS)}
  }
}

const palmaDe = p => Math.hypot(p[9][0], p[9][1]) || 1e-3
const ponta = q => [q.punho[0] + q.pontos[8][0], q.punho[1] + q.pontos[8][1]]

/** Distância percorrida pela ponta do indicador, em palmas. */
export function caminho(qs) {
  const pal = palmaDe(qs[0].pontos)
  let s = 0
  for (let i = 1; i < qs.length; i++) {
    const a = ponta(qs[i - 1]), b = ponta(qs[i])
    s += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return s / pal
}

function reamostrarQuadros(qs, n) {
  const t0 = qs[0].t, t1 = qs[qs.length - 1].t
  const out = []
  let j = 0
  for (let k = 0; k < n; k++) {
    const alvo = t0 + ((t1 - t0) * k) / (n - 1)
    while (j < qs.length - 1 && Math.abs(qs[j + 1].t - alvo) <= Math.abs(qs[j].t - alvo)) j++
    const q = qs[j]
    out.push({t: +(q.t - t0).toFixed(3), punho: q.punho.map(v => +v.toFixed(4)), pontos: q.pontos.map(p => p.map(v => +v.toFixed(4)))})
  }
  return out
}

// ---------- Características e DTW ----------

const PONTAS = [4, 8, 12, 16, 20]

/**
 * Uma linha por quadro: trajetória da ponta do indicador (normalizada pelo tamanho do
 * próprio gesto, para valer para gestos maiores ou menores), trajetória do punho (também
 * normalizada) e o formato da mão (pontas dos dedos em palmas).
 */
export function caracteristicasGesto(qs) {
  const p0 = ponta(qs[0])
  const traj = qs.map(q => { const p = ponta(q); return [p[0] - p0[0], p[1] - p0[1]] })
  const ext = Math.max(1e-3, ...traj.map(([x, y]) => Math.hypot(x, y)))
  return qs.map((q, i) => {
    const pal = palmaDe(q.pontos)
    const f = [1.5 * traj[i][0] / ext, 1.5 * traj[i][1] / ext,
      0.5 * (q.punho[0] - qs[0].punho[0]) / ext, 0.5 * (q.punho[1] - qs[0].punho[1]) / ext]
    for (const k of PONTAS) f.push(0.35 * q.pontos[k][0] / pal, 0.35 * q.pontos[k][1] / pal, 0.35 * q.pontos[k][2] / pal)
    return f
  })
}

/** DTW com faixa de Sakoe-Chiba; custo médio por passo do melhor alinhamento. */
export function dtw(a, b, faixa = 5) {
  const n = a.length, m = b.length
  const D = Array.from({length: n + 1}, () => new Float64Array(m + 1).fill(Infinity))
  const L = Array.from({length: n + 1}, () => new Uint16Array(m + 1))
  D[0][0] = 0
  for (let i = 1; i <= n; i++) {
    for (let j = Math.max(1, i - faixa); j <= Math.min(m, i + faixa); j++) {
      let d = 0
      for (let k = 0; k < a[i - 1].length; k++) { const x = a[i - 1][k] - b[j - 1][k]; d += x * x }
      d = Math.sqrt(d)
      let best = D[i - 1][j - 1], len = L[i - 1][j - 1]
      if (D[i - 1][j] < best) { best = D[i - 1][j]; len = L[i - 1][j] }
      if (D[i][j - 1] < best) { best = D[i][j - 1]; len = L[i][j - 1] }
      D[i][j] = best + d
      L[i][j] = len + 1
    }
  }
  return D[n][m] / Math.max(1, L[n][m])
}

// ---------- Amostras do usuário ----------

export function lerGestos() {
  try { return JSON.parse(localStorage.getItem(CHAVE)) || [] } catch { return [] }
}
function salvar(lista) {
  try { localStorage.setItem(CHAVE, JSON.stringify(lista)) } catch { throw new Error('sem espaço no armazenamento do navegador') }
}
export function adicionarGesto(rotulo, quadros) {
  salvar([...lerGestos(), {r: rotulo, quadros, em: Date.now()}])
}
export function removerGestos(rotulo) {
  salvar(lerGestos().filter(g => g.r !== rotulo))
}
export function contagemGestos() {
  return lerGestos().reduce((c, g) => ({...c, [g.r]: (c[g.r] || 0) + 1}), {})
}

/**
 * Prepara o classificador: características de cada amostra e um limiar por sinal,
 * calculado com as próprias amostras (deixa-uma-de-fora): 1,6 × a maior distância de
 * uma amostra à mais parecida do mesmo sinal, com um piso (gravações quase idênticas dariam
 * um limiar estreito demais, recusando o mesmo gesto feito com pausas ou outro ritmo).
 * Sinais com menos de MIN_AMOSTRAS ficam de fora.
 */
export function prepararGestos(lista = lerGestos()) {
  const porRotulo = {}
  for (const g of lista) (porRotulo[g.r] ??= []).push(caracteristicasGesto(g.quadros))
  const modelos = []
  for (const [r, fs] of Object.entries(porRotulo)) {
    if (fs.length < MIN_AMOSTRAS) continue
    const loo = fs.map((f, i) => Math.min(...fs.filter((_, j) => j !== i).map(g => dtw(f, g))))
    modelos.push({r, fs, limiar: Math.max(LIMIAR_MINIMO, 1.6 * Math.max(...loo))})
  }
  return modelos
}

/** Classifica um gesto recortado. Só aceita se estiver dentro do limiar do sinal e claramente mais perto dele. */
export function classificarGesto(modelos, gesto) {
  if (!modelos.length) return null
  const f = caracteristicasGesto(gesto.quadros)
  const ds = modelos.map(m => ({r: m.r, d: Math.min(...m.fs.map(g => dtw(f, g))), limiar: m.limiar})).sort((a, b) => a.d - b.d)
  const [a, b] = ds
  const ok = a.d <= a.limiar && (!b || a.d < 0.85 * b.d)
  return {rotulo: ok ? a.r : null, maisParecido: a.r, distancia: a.d, limiar: a.limiar}
}
