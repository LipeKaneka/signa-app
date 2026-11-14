// Reconhecimento de sinais DINÂMICOS (com movimento): características por quadro,
// recorte do sinal e inferência da LSTM treinada em ml/treinar.py.
//
// ATENÇÃO: as contas aqui espelham ml/caracteristicas.py. Se mudar uma, mude a outra
// (ml/testar_paridade.py confere que as duas dão o mesmo resultado).
// Arquivo sem dependências de navegador, para poder ser testado no Node.

export const CORPO = [0, 2, 5, 9, 10, 11, 12, 13, 14, 15, 16]
export const N_CORPO = CORPO.length * 2
export const N_MAO = 66
export const N_CARAC = N_CORPO + 2 * N_MAO
export const FOLGA = 2

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by)

/**
 * Extrai as 154 características de cada quadro. Guarda a última referência do corpo
 * (quadros sem pose usam a anterior, como no Python).
 * pose: 33 pontos {x,y,z,visibility} | null; maos: lista (até 2) de 21 pontos {x,y,z}.
 */
export class Extrator {
  constructor() { this.ref = null }

  quadro(pose, maos, w, h) {
    const X = new Float32Array(N_CARAC)
    if (pose && pose[11] && pose[12]) {
      const lx = pose[11].x * w, ly = pose[11].y * h, rx = pose[12].x * w, ry = pose[12].y * h
      const esc = dist(lx, ly, rx, ry)
      if (esc > 1e-3) this.ref = {cx: (lx + rx) / 2, cy: (ly + ry) / 2, esc, pose}
    }
    if (!this.ref) return {X, valido: false, comMao: false}
    const {cx, cy, esc, pose: pr} = this.ref
    const nx = p => (p.x * w - cx) / esc
    const ny = p => (p.y * h - cy) / esc
    CORPO.forEach((k, i) => { X[2 * i] = nx(pr[k]); X[2 * i + 1] = ny(pr[k]) })
    const pd = [nx(pr[16]), ny(pr[16])]
    const pe = [nx(pr[15]), ny(pr[15])]
    const feitas = (maos || []).slice(0, 2).map(m => ({m, punho: [nx(m[0]), ny(m[0])]}))
    const slots = atribuirSlots(feitas.map(f => f.punho), pd, pe)
    let comMao = false
    feitas.forEach(({m, punho}, i) => {
      const px = m.map(p => [p.x * w, p.y * h, p.z * w])
      const palma = dist(px[9][0], px[9][1], px[0][0], px[0][1])
      if (palma < 1e-3) return
      const o = N_CORPO + slots[i] * N_MAO
      X[o] = 1
      X[o + 1] = punho[0]
      X[o + 2] = punho[1]
      for (let j = 0; j < 21; j++) {
        X[o + 3 + 3 * j] = (px[j][0] - px[0][0]) / palma
        X[o + 4 + 3 * j] = (px[j][1] - px[0][1]) / palma
        X[o + 5 + 3 * j] = (px[j][2] - px[0][2]) / palma
      }
      comMao = true
    })
    return {X, valido: true, comMao}
  }
}

/** 0 = mão do lado direito da pessoa, 1 = esquerdo (pelo punho da pose mais próximo). */
export function atribuirSlots(punhos, pd, pe) {
  const d = (a, b) => dist(a[0], a[1], b[0], b[1])
  if (!punhos.length) return []
  if (punhos.length === 1) return [d(punhos[0], pd) <= d(punhos[0], pe) ? 0 : 1]
  const [a, b] = punhos
  return d(a, pd) + d(b, pe) <= d(a, pe) + d(b, pd) ? [0, 1] : [1, 0]
}

/** Escolhe n quadros igualmente espaçados no tempo (vizinho mais próximo, empate fica com o anterior). */
export function reamostrar(Xs, ts, n) {
  const out = []
  const t0 = ts[0], t1 = ts[ts.length - 1]
  for (let k = 0; k < n; k++) {
    const alvo = n === 1 ? t0 : t0 + ((t1 - t0) * k) / (n - 1)
    let j = 0
    while (j < ts.length && ts[j] < alvo) j++ // searchsorted (esquerda)
    j = Math.min(j, ts.length - 1)
    const j0 = Math.max(j - 1, 0)
    out.push(Math.abs(ts[j0] - alvo) <= Math.abs(ts[j] - alvo) ? Xs[j0] : Xs[j])
  }
  return out
}

/**
 * Recorta sinais em tempo real: um sinal começa quando alguma mão aparece e termina quando
 * as mãos somem por `pausa` segundos (como nas gravações, que vão de repouso a repouso).
 * push() devolve {Xs, ts} do sinal completo (só quadros válidos) ou null.
 */
export class Segmentador {
  constructor({pausa = 0.5, duracaoMin = 0.3, quadrosMin = 5, duracaoMax = 6} = {}) {
    Object.assign(this, {pausa, duracaoMin, quadrosMin, duracaoMax})
    this.reiniciar()
  }

  reiniciar() {
    this.antes = []      // últimos quadros sem mão (folga do início)
    this.buf = null      // quadros do sinal em andamento
    this.ultimaMao = -1  // índice em buf do último quadro com mão
  }

  get ativo() { return !!this.buf }

  push(q) { // q = {X, valido, comMao, t}
    if (!this.buf) {
      if (!q.comMao) {
        this.antes.push(q)
        if (this.antes.length > FOLGA) this.antes.shift()
        return null
      }
      this.buf = [...this.antes, q]
      this.antes = []
      this.ultimaMao = this.buf.length - 1
      return null
    }
    this.buf.push(q)
    if (q.comMao) this.ultimaMao = this.buf.length - 1
    const tUlt = this.buf[this.ultimaMao].t
    const comMaos = this.buf.filter(x => x.comMao)
    const durou = tUlt - comMaos[0].t
    if (q.t - tUlt < this.pausa && durou < this.duracaoMax) return null
    const trecho = this.buf.slice(0, this.ultimaMao + 1 + FOLGA).filter(x => x.valido)
    this.reiniciar()
    if (durou < this.duracaoMin || comMaos.length < this.quadrosMin || trecho.length < 3) return {curto: true}
    return {Xs: trecho.map(x => x.X), ts: trecho.map(x => x.t)}
  }
}

// ---------- Modelo ----------

const f32 = b64 => {
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary')
  const u8 = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
  return new Float32Array(u8.buffer)
}

/** Converte o JSON exportado. Recusa modelos que não passaram na avaliação. */
export function prepararModelo(json) {
  if (!json || json.tipo !== 'lstm-sinais-dinamicos' || json.aprovado !== true) {
    throw new Error('modelo de sinais dinâmicos ausente ou não aprovado na avaliação')
  }
  const c = json.camadas
  return {
    ...json,
    media: f32(json.media), desvio: f32(json.desvio),
    W1: f32(c.entrada.W), b1: f32(c.entrada.b), nOcultas: c.entrada.forma[1],
    Wl: f32(c.lstm.W), Ul: f32(c.lstm.U), bl: f32(c.lstm.b), u: c.lstm.unidades,
    W2: f32(c.saida.W), b2: f32(c.saida.b), nClasses: c.saida.forma[1],
  }
}

export async function carregarModelo(url = './modelos/sinais-dinamicos.json') {
  const r = await fetch(url, {cache: 'no-cache'})
  if (!r.ok) throw new Error('modelo de sinais dinâmicos ainda não foi gerado')
  return prepararModelo(await r.json())
}

const sig = x => 1 / (1 + Math.exp(-x))

/** seq: n quadros (Float32Array de N_CARAC) -> probabilidades por sinal (mesmas contas do Keras). */
export function inferir(m, seq) {
  const F = m.n_carac, H = m.nOcultas, U = m.u
  let h = new Float32Array(U), c = new Float32Array(U)
  const x = new Float32Array(F), e = new Float32Array(H), z = new Float32Array(4 * U)
  for (const q of seq) {
    for (let i = 0; i < F; i++) x[i] = (q[i] - m.media[i]) / m.desvio[i]
    // Dense + ReLU aplicada ao quadro
    for (let j = 0; j < H; j++) {
      let s = m.b1[j]
      for (let i = 0; i < F; i++) s += x[i] * m.W1[i * H + j]
      e[j] = s > 0 ? s : 0
    }
    // LSTM (portas na ordem do Keras: entrada, esquecimento, célula, saída)
    for (let j = 0; j < 4 * U; j++) {
      let s = m.bl[j]
      for (let i = 0; i < H; i++) s += e[i] * m.Wl[i * 4 * U + j]
      for (let i = 0; i < U; i++) s += h[i] * m.Ul[i * 4 * U + j]
      z[j] = s
    }
    const h2 = new Float32Array(U), c2 = new Float32Array(U)
    for (let j = 0; j < U; j++) {
      const ig = sig(z[j]), fg = sig(z[U + j]), cg = Math.tanh(z[2 * U + j]), og = sig(z[3 * U + j])
      c2[j] = fg * c[j] + ig * cg
      h2[j] = og * Math.tanh(c2[j])
    }
    h = h2; c = c2
  }
  const lg = new Float32Array(m.nClasses)
  for (let k = 0; k < m.nClasses; k++) {
    let s = m.b2[k]
    for (let i = 0; i < U; i++) s += h[i] * m.W2[i * m.nClasses + k]
    lg[k] = s
  }
  const mx = Math.max(...lg)
  const ex = Array.from(lg, v => Math.exp(v - mx))
  const soma = ex.reduce((a, b) => a + b, 0)
  return ex.map(v => v / soma)
}

/** Limiar de um sinal: o calibrado na validação ou, para os experimentais (só do INES, sem teste), o mais alto. */
export function limiarDoSinal(m, sinal) {
  return sinal?.experimental ? Math.max(m.limiar, m.limiar_experimental ?? 0.85) : m.limiar
}

/** Classifica um sinal recortado. Abaixo do limiar do sinal: não reconhecido. */
export function classificarSinal(m, {Xs, ts}) {
  const p = inferir(m, reamostrar(Xs, ts, m.passos))
  const ordem = p.map((v, k) => [v, k]).sort((a, b) => b[0] - a[0])
  const [conf, k] = ordem[0]
  const sinal = m.sinais[k]
  const limiar = limiarDoSinal(m, sinal)
  const top = ordem.slice(0, 3).map(([v, i]) => ({palavra: m.sinais[i].palavra, p: v}))
  return {
    palavra: conf >= limiar ? sinal.palavra : null, confianca: conf, maisParecido: sinal.palavra, top,
    limiar, experimental: Boolean(sinal.experimental),
  }
}
