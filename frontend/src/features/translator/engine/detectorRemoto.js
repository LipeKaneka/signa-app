// Detector usado pela câmera: roda o MediaPipe num Web Worker (thread separada), para a tela
// não travar no celular, e escolhe sozinho CPU ou GPU medindo as duas no próprio aparelho
// na primeira vez (a escolha fica guardada). Se o worker não funcionar no navegador, cai para
// a detecção na thread principal (maos-local.js, carregado só nesse caso), com o mesmo formato de resultado.
import {MODELO, MODELO_POSE, OPCOES_MAO, WASM} from './maos'

const CHAVE = 'signa:delegado-v1'
const QUADROS_TESTE = 8
const abs = u => new URL(u, location.href).href

class Remoto {
  constructor(corpo, delegado) {
    this.corpo = corpo
    this.delegado = delegado
    this.n = 0
    this.pend = new Map()
    this.w = new Worker(new URL('./visao.worker.js', import.meta.url), {type: 'module'})
    this.w.onmessage = ({data}) => {
      if (data.tipo === 'pronto' || (data.tipo === 'erro' && data.id == null)) return this.aoIniciar?.(data)
      const p = this.pend.get(data.id)
      this.pend.delete(data.id)
      if (!p) return
      data.tipo === 'erro' ? p.rejeitar(new Error(data.mensagem)) : p.resolver(data)
    }
  }

  iniciar() {
    return new Promise((ok, falha) => {
      const t = setTimeout(() => falha(new Error('o detector demorou demais para iniciar')), 60000)
      this.aoIniciar = d => { clearTimeout(t); d.tipo === 'pronto' ? ok(this) : falha(new Error(d.mensagem)) }
      this.w.onerror = e => { clearTimeout(t); falha(new Error(e.message || 'falha no worker')) }
      this.w.postMessage({tipo: 'iniciar', wasm: abs(WASM), modeloMao: abs(MODELO), modeloPose: abs(MODELO_POSE),
        corpo: this.corpo, delegado: this.delegado, opcoesMao: OPCOES_MAO})
    })
  }

  /** Manda uma mensagem e espera a resposta com o mesmo id. */
  pedir(mensagem, transferir = []) {
    if (this.fechado) {
      transferir.forEach(b => b.close?.())
      return Promise.reject(new Error('detector fechado'))
    }
    const id = this.n++
    return new Promise((resolver, rejeitar) => {
      this.pend.set(id, {resolver, rejeitar})
      this.w.postMessage({...mensagem, id}, transferir)
    })
  }

  /** fonte: <video> ou canvas. Devolve {rm, pose, ms}. */
  async detectar(fonte) {
    const bitmap = await createImageBitmap(fonte)
    return this.pedir({tipo: 'quadro', bitmap, ts: performance.now()}, [bitmap])
  }

  /** Liga/desliga a pose (sinais com movimento) sem recriar o worker. */
  async definirCorpo(corpo) {
    if (corpo === this.corpo) return
    await this.pedir({tipo: 'corpo', corpo})
    this.corpo = corpo
  }

  /** Fecha o worker; quadros ainda esperando resposta terminam com erro (não ficam pendurados). */
  fechar() {
    this.fechado = true
    this.w.terminate()
    for (const p of this.pend.values()) p.rejeitar(new Error('detector fechado'))
    this.pend.clear()
  }
}

/** Fallback na thread principal, com a mesma interface. */
class Local {
  constructor(corpo) { this.corpo = corpo; this.delegado = 'CPU (sem worker)' }
  async iniciar() {
    this.m = await import('./maos-local.js')
    this.det = await this.carregar(this.corpo)
    return this
  }
  carregar(corpo) {
    return corpo ? this.m.detectorCorpo() : this.m.detector('VIDEO')
  }
  /** Troca o detector só depois de o novo estar pronto (os quadros do meio usam o anterior). */
  async definirCorpo(corpo) {
    if (corpo === this.corpo) return
    const det = await this.carregar(corpo)
    this.det = det
    this.corpo = corpo
  }
  async detectar(fonte) {
    const t0 = performance.now()
    if (this.corpo) { const r = this.m.detectarCorpo(this.det, fonte); return {rm: r.rm, pose: r.pose, ms: performance.now() - t0} }
    return {rm: this.m.detectarQuadro(this.det, fonte), pose: null, ms: performance.now() - t0}
  }
  fechar() {}
}

const lerEscolha = () => { try { return localStorage.getItem(CHAVE) } catch { return null } }
const salvarEscolha = d => { try { localStorage.setItem(CHAVE, d) } catch {} }

async function medir(det, fonte) {
  const ts = []
  for (let i = 0; i < QUADROS_TESTE; i++) ts.push((await det.detectar(fonte)).ms)
  return ts.slice(2).reduce((a, b) => a + b, 0) / (ts.length - 2) // ignora o aquecimento
}

/**
 * Cria o detector para a câmera. Na primeira vez no aparelho, mede CPU e GPU com a própria
 * câmera (≈1 s) e guarda a mais rápida. avisar(texto) mostra o que está acontecendo.
 */
export async function criarDetector({corpo, fonte, avisar = () => {}}) {
  if (typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined') return new Local(corpo).iniciar()
  try {
    let escolha = lerEscolha()
    if (!escolha) {
      avisar('Ajustando o detector a este aparelho (só na primeira vez)…')
      const cpu = await new Remoto(corpo, 'CPU').iniciar()
      const tCpu = await medir(cpu, fonte)
      let tGpu = Infinity
      let gpu = null
      try {
        gpu = await new Remoto(corpo, 'GPU').iniciar()
        tGpu = await medir(gpu, fonte)
      } catch { /* GPU indisponível: fica a CPU */ }
      escolha = tGpu < tCpu * 0.85 ? 'GPU' : 'CPU'
      salvarEscolha(escolha)
      if (escolha === 'GPU') { cpu.fechar(); return gpu }
      gpu?.fechar()
      return cpu
    }
    return await new Remoto(corpo, escolha).iniciar()
  } catch {
    return new Local(corpo).iniciar()
  }
}
