// Usado por testar_paridade.py: roda a versão JavaScript (frontend/src/features/translator/engine/dinamicos.js)
// sobre os mesmos pontos brutos e devolve características, recorte e probabilidades.
import {readFileSync} from 'node:fs'
import {Extrator, FOLGA, N_CORPO, N_MAO, Segmentador, inferir, prepararModelo, reamostrar} from '../frontend/src/features/translator/engine/dinamicos.js'

const [, , arqDados, arqModelo] = process.argv
const d = JSON.parse(readFileSync(arqDados, 'utf8'))
const ex = new Extrator()
const quadros = d.quadros.map((q, i) => ({...ex.quadro(q.pose, q.maos, d.w, d.h), t: d.t[i]}))

// Recorte igual ao do treino (trecho entre a primeira e a última mão, com folga)
const idx = quadros.map((q, i) => (q.valido && q.comMao ? i : -1)).filter(i => i >= 0)
const a = Math.max(0, idx[0] - FOLGA), b = Math.min(quadros.length, idx[idx.length - 1] + 1 + FOLGA)
const trecho = quadros.slice(a, b).filter(q => q.valido)
const seq = reamostrar(trecho.map(q => q.X), trecho.map(q => q.t), d.passos)

// Segmentador de tempo real alimentado quadro a quadro (com quadros vazios no fim)
const seg = new Segmentador()
let recorte = null
const dt = d.t.length > 1 ? d.t[1] - d.t[0] : 1 / 30
const extra = Array.from({length: 30}, (_, k) => ({X: new Float32Array(N_CORPO + 2 * N_MAO), valido: true, comMao: false, t: d.t[d.t.length - 1] + dt * (k + 1)}))
for (const q of [...quadros, ...extra]) {
  const r = seg.push(q)
  if (r && !r.curto) { recorte = {n: r.Xs.length, t0: r.ts[0], t1: r.ts[r.ts.length - 1]}; break }
}

const saida = {seq: seq.map(x => Array.from(x)), recorteTreino: {n: trecho.length, t0: trecho[0].t, t1: trecho[trecho.length - 1].t}, recorteTempoReal: recorte}
if (arqModelo) saida.prob = inferir(prepararModelo(JSON.parse(readFileSync(arqModelo, 'utf8'))), seq)
process.stdout.write(JSON.stringify(saida))
