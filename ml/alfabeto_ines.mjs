// Alfabeto do INES → dados do app, usando o PRÓPRIO código do app (frontend/src/features/translator/engine).
//
// Entrada: <SIGNA_DADOS>/ines/alfabeto/<LETRA>.json (gerado por alfabeto_ines.py).
// Para cada letra, simula a câmera do app quadro a quadro (mesmos filtros de mão, presença, movimento e
// "mão parada") e:
//   - letras paradas: guarda alguns quadros com a mão parada como amostras (como as das outras bases);
//   - letras com movimento (H, J, K, X, Z, Ç): recorta o gesto com o DetectorGesto do app.
//
// Uso (na raiz do repositório; o esbuild do frontend resolve os imports do app):
//   npx --prefix frontend esbuild ml/alfabeto_ines.mjs --bundle --platform=node --format=esm --outfile=ml/.alfabeto.mjs && node ml/.alfabeto.mjs [--gravar]
// Sem --gravar só mostra o diagnóstico (convenção da câmera, acerto nas letras paradas, gestos recortados).
import {readFileSync, readdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {amostrasBase, caracteristicas, classificar, pontosNormalizados} from '../frontend/src/features/translator/engine/classificador.js'
import {motivoImplausivel, movimento} from '../frontend/src/features/translator/engine/perfil.js'
import {DetectorGesto, caracteristicasGesto, caminho, dtw, PASSOS} from '../frontend/src/features/translator/engine/movimento.js'

const DADOS = process.env.SIGNA_DADOS || 'D:\\signa-dados'
const PASTA = join(DADOS, 'ines', 'alfabeto')
const LETRAS_MOVIMENTO = ['H', 'J', 'K', 'X', 'Z', 'Ç']
const FPS_APP = 30 // a câmera do app roda perto disso; os vídeos do INES têm 12 quadros/s
const LIMIAR_PARADA = 0.08 // sensibilidade "Normal" do app
const PRESENCA = 3 // quadros seguidos com mão (useHandCamera.js)
const AMOSTRAS_POR_LETRA = 8

const letras = readdirSync(PASTA).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(PASTA, f), 'utf8')))

/** Reamostra para FPS_APP, interpolando os pontos entre quadros vizinhos que têm mão (do mesmo lado). */
function para30fps(l) {
  const qs = l.quadros
  const fim = qs[qs.length - 1].t
  const out = []
  for (let t = 0; t <= fim + 1e-6; t += 1 / FPS_APP) {
    let j = qs.findIndex(q => q.t > t) - 1
    if (j < 0) j = qs.length - 1
    const a = qs[j], b = qs[Math.min(j + 1, qs.length - 1)]
    if (!a.mao) { out.push({t, mao: null}); continue }
    if (!b.mao || b === a || b.mao.lado !== a.mao.lado) { out.push({t, mao: a.mao}); continue }
    const u = (t - a.t) / (b.t - a.t)
    out.push({t, mao: {...a.mao, pontos: a.mao.pontos.map((p, i) => p.map((v, k) => v + u * (b.mao.pontos[i][k] - v)))}})
  }
  return out
}

/**
 * Simula o laço da câmera (useHandCamera + useSignTranslator) e devolve, por quadro:
 * {t, mao, pontos, still, movement}. inverter = trocar direita/esquerda (vídeo de câmera "de fora").
 */
function simular(l, inverter) {
  const aspecto = l.w / l.h
  let anterior = null, seguidos = 0
  const recentes = []
  return para30fps(l).map(({t, mao: m}) => {
    let mao = m && {pontos: m.pontos.map(([x, y, z]) => ({x, y, z})), lado: inverter ? (m.lado === 'Left' ? 'Right' : 'Left') : m.lado}
    let pontos = mao ? pontosNormalizados(mao.pontos, mao.lado, aspecto) : null
    if (mao && motivoImplausivel(mao, pontos, aspecto)) { mao = null; pontos = null }
    seguidos = mao ? seguidos + 1 : 0
    if (seguidos < PRESENCA) { mao = null; pontos = null }
    const mov = mao ? movimento(anterior, mao.pontos, aspecto) : 0
    anterior = mao ? mao.pontos : null
    if (mao) { recentes.push(mov); if (recentes.length > 4) recentes.shift() } else recentes.length = 0
    const media = recentes.length ? recentes.reduce((s, v) => s + v, 0) / recentes.length : 0
    const still = Boolean(mao) && recentes.length >= 3 && media < LIMIAR_PARADA
    return {t, mao, pontos, still, movement: media, aspecto}
  })
}

/** Mesmo quadro de gesto que buildGestureFrame (useSignTranslator.js). */
const quadroGesto = q => q.mao && {
  t: q.t, pontos: q.pontos,
  punho: [(q.mao.lado === 'Left' ? -1 : 1) * q.mao.pontos[0].x * q.aspecto, q.mao.pontos[0].y],
  movendo: q.movement > LIMIAR_PARADA * 1.2, parada: q.still,
}

/**
 * Gestos que o DetectorGesto do app recorta do vídeo, na ordem em que acontecem. Com depoisDeParar, ignora
 * tudo antes da mão parar pela primeira vez: no INES a mão sobe, para na configuração da letra e só então
 * faz o movimento (a subida não é a letra).
 */
function gestos(quadros, {depoisDeParar = false} = {}) {
  const det = new DetectorGesto()
  const achados = []
  const inicio = depoisDeParar ? Math.max(0, quadros.findIndex(q => q.still)) : 0
  for (const q of quadros.slice(inicio)) {
    const g = det.push(quadroGesto(q) || null)
    if (g && !g.curto) achados.push(g)
  }
  // fim do vídeo: a mão para (repete o último quadro com mão)
  const ultimo = quadros.findLast(q => q.mao)
  for (let k = 1; ultimo && k <= 20 && det.ativo; k++) {
    const g = det.push({...quadroGesto(ultimo), t: ultimo.t + k / FPS_APP, movendo: false, parada: true})
    if (g && !g.curto) achados.push(g)
  }
  return achados
}

/** Quadros parados espalhados pelo trecho de mão parada mais longo. */
function amostrasParadas(quadros) {
  const parados = quadros.filter(q => q.still && q.pontos)
  if (!parados.length) return []
  const passo = Math.max(1, Math.floor(parados.length / AMOSTRAS_POR_LETRA))
  return parados.filter((_, i) => i % passo === 0).slice(0, AMOSTRAS_POR_LETRA).map(q => q.pontos)
}

const base = amostrasBase()
function avaliarConvencao(inverter) {
  let certas = 0, total = 0
  const linhas = []
  for (const l of letras.filter(l => !LETRAS_MOVIMENTO.includes(l.letra))) {
    const ps = amostrasParadas(simular(l, inverter))
    const votos = ps.map(p => classificar(caracteristicas(p), base).maisParecido)
    const ok = votos.filter(v => v === l.letra).length
    certas += ok; total += ps.length
    linhas.push(`${l.letra}:${ok}/${ps.length}${ok < ps.length ? `(${[...new Set(votos.filter(v => v !== l.letra))].join('')})` : ''}`)
  }
  return {certas, total, linhas}
}

const cru = avaliarConvencao(false), inv = avaliarConvencao(true)
console.log(`Letras paradas do INES classificadas pela base atual do app:`)
console.log(`  lado como veio do MediaPipe: ${cru.certas}/${cru.total}  ${cru.linhas.join(' ')}`)
console.log(`  lado invertido:              ${inv.certas}/${inv.total}  ${inv.linhas.join(' ')}`)
const inverter = inv.certas > cru.certas
console.log(`→ usando ${inverter ? 'lado invertido' : 'lado como veio'}`)


// ---------- Letras com movimento ----------

/** Reamostra por tempo para PASSOS quadros (mesma regra de reamostrarQuadros em movimento.js). */
function reamostrar(qs, n = PASSOS) {
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

/**
 * Onde está o movimento da letra em cada vídeo (visto na linha do tempo, --linha, e no traçado da ponta do dedo):
 * - K: a mão sobe, para na configuração e então faz o movimento (0,4 s, 3 palmas);
 * - Z: a mão já aparece desenhando o Z (→, diagonal ↙, →; 0,7 s, 8 palmas), antes da primeira parada.
 * Ficam de fora (só "ensinar no aparelho"): H e J (movimento de 0,2 s e menos de 1 palma, abaixo do mínimo que o
 * app usa para perceber um gesto, então copiar o vídeo não reconheceria ninguém), X e Ç (o movimento não aparece
 * no vídeo de 240×176 a 12 quadros/s).
 */
const SEGMENTOS = {K: 'depoisDaParada', Z: 'primeiroMovimento'}

/** Trechos seguidos de "mão mexendo", com início e fim (índices dos quadros). */
function trechosMexendo(quadros) {
  const trechos = []
  quadros.forEach((q, i) => {
    const mexendo = q.mao && !q.still
    const ultimo = trechos.at(-1)
    if (mexendo && ultimo?.fim === i - 1) ultimo.fim = i
    else if (mexendo) trechos.push({ini: i, fim: i})
  })
  return trechos
}

function segmentoDaLetra(letra, quadros) {
  const trechos = trechosMexendo(quadros)
  const primeiraParada = quadros.findIndex(q => q.still)
  const trecho = SEGMENTOS[letra] === 'depoisDaParada' ? trechos.find(t => t.ini > primeiraParada)
    : SEGMENTOS[letra] === 'primeiroMovimento' ? trechos.find(t => t.fim > t.ini) : null
  if (!trecho) return null
  // um quadro antes e um depois: a configuração parada de onde o movimento sai e onde chega
  const qs = quadros.slice(Math.max(0, trecho.ini - 1), trecho.fim + 2).map(quadroGesto).filter(Boolean)
  if (qs.length < 4 || caminho(qs) < 1.2) return null // 1,2 palmas: o mínimo do DetectorGesto do app
  return reamostrar(qs)
}

/** Variações de um gesto (ritmo e inclinação um pouco diferentes), para o limiar não ficar preso a uma gravação. */
function variacoes(quadros, n = 7) {
  const out = []
  for (let v = 0; v < n; v++) {
    const k = [0.8, 1.25, 0.9, 1.1, 1, 1, 1][v]          // ritmo
    const ang = [0, 0, 0, 0, -8, 8, 4][v] * Math.PI / 180 // inclinação da trajetória
    const c = Math.cos(ang), s = Math.sin(ang)
    const rot = ([x, y]) => [x * c - y * s, x * s + y * c]
    const dur = quadros.at(-1).t || 1
    const comTempo = quadros.map(q => ({...q, t: dur * (q.t / dur) ** k}))
    const p0 = quadros[0].punho
    out.push(reamostrar(comTempo.map(q => {
      const [dx, dy] = rot([q.punho[0] - p0[0], q.punho[1] - p0[1]])
      return {...q, punho: [p0[0] + dx, p0[1] + dy], pontos: q.pontos.map(([x, y, z]) => [...rot([x, y]), z])}
    })))
  }
  return out
}

const LIMIAR_MINIMO = 0.15 // o mesmo piso de movimento.js
// Teto: em movimento.js, "movimento diferente ≈ 0,55". Uma gravação de uma pessoa só não justifica aceitar mais.
const LIMIAR_MAXIMO = 0.45
const movimentoPorLetra = {}
for (const l of letras.filter(l => LETRAS_MOVIMENTO.includes(l.letra))) {
  const seg = segmentoDaLetra(l.letra, simular(l, inverter))
  if (seg) movimentoPorLetra[l.letra] = seg
}
// Negativos de verdade: tudo que o DetectorGesto recorta dos vídeos das letras PARADAS (subir, posicionar e
// baixar a mão). Nenhum deles pode ser aceito como letra com movimento.
const negativos = letras.filter(l => !LETRAS_MOVIMENTO.includes(l.letra))
  .flatMap(l => gestos(simular(l, inverter)).map(g => ({de: l.letra, f: caracteristicasGesto(g.quadros)})))

console.log(`\nLetras com movimento (${negativos.length} movimentos "de não-letra" como teste):`)
const gestosBase = [], limiares = {}
const fsLetra = Object.fromEntries(Object.entries(movimentoPorLetra).map(([r, q]) => [r, caracteristicasGesto(q)]))
for (const letra of LETRAS_MOVIMENTO) {
  const q = movimentoPorLetra[letra]
  if (!q) { console.log(`  ${letra}: sem movimento aproveitável no vídeo — fica só "ensinar no aparelho"`); continue }
  const f = fsLetra[letra]
  const negMin = Math.min(...negativos.map(n => dtw(f, n.f)))
  const outras = Object.entries(fsLetra).filter(([r]) => r !== letra).map(([, g]) => dtw(f, g))
  const outraMin = outras.length ? Math.min(...outras) : Infinity
  // limiar: abaixo de 80% do negativo mais parecido, de 60% da outra letra mais parecida e do teto
  const limiar = +Math.max(LIMIAR_MINIMO, Math.min(0.8 * negMin, 0.6 * outraMin, LIMIAR_MAXIMO)).toFixed(3)
  const vars = variacoes(q)
  const longeDemais = vars.filter(v => dtw(caracteristicasGesto(v), f) > limiar).length
  console.log(`  ${letra}: caminho ${caminho(q).toFixed(1)} palmas · não-letra mais parecida ${negMin.toFixed(2)} · outra letra ${outraMin.toFixed(2)} → limiar ${limiar}`
    + (longeDemais ? ` (${longeDemais}/${vars.length} variações ficariam de fora)` : ''))
  limiares[letra] = limiar
  for (const v of [q, ...vars]) gestosBase.push({r: letra, quadros: v})
}

// ---------- Letras paradas: efeito de juntar o INES, medido em dados independentes ----------

const amostrasInes = letras.filter(l => !LETRAS_MOVIMENTO.includes(l.letra))
  .flatMap(l => amostrasParadas(simular(l, inverter)).map(p => ({rotulo: l.letra, p, f: 'ines'})))
/** Acerto nas fotos de celular da base "bench" (outra pessoa), classificadas pelas demais fontes. */
function acertoBench(comInes) {
  const treino = [...base.filter(a => a.f !== 'bench'), ...(comInes ? amostrasInes.map(a => ({...a, origem: 'base', v: caracteristicas(a.p)})) : [])]
  const teste = base.filter(a => a.f === 'bench')
  const porLetra = {}
  let ok = 0
  for (const a of teste) {
    const r = classificar(a.v, treino).rotulo
    porLetra[a.rotulo] ??= [0, 0]
    porLetra[a.rotulo][1]++
    if (r === a.rotulo) { ok++; porLetra[a.rotulo][0]++ }
  }
  return {ok, total: teste.length, porLetra}
}
const sem = acertoBench(false), com = acertoBench(true)
console.log(`\nLetras paradas — fotos de celular da benchmarking-libras (outra pessoa), sem elas no treino:`)
console.log(`  sem INES: ${(100 * sem.ok / sem.total).toFixed(1)}%   com INES: ${(100 * com.ok / com.total).toFixed(1)}%   (${sem.total} fotos)`)
console.log('  por letra (sem → com): ' + Object.keys(sem.porLetra).sort().map(r => {
  const [a, n] = sem.porLetra[r], [b] = com.porLetra[r]
  return a === b ? null : `${r} ${a}/${n}→${b}/${n}`
}).filter(Boolean).join('  '))

// ---------- Gravar ----------

if (process.argv.includes('--gravar')) {
  // rodar na raiz do repositório (o script é empacotado pelo esbuild em outra pasta)
  const ENGINE = join(process.cwd(), 'frontend', 'src', 'features', 'translator', 'engine')
  const arqBase = join(ENGINE, 'amostras-base.json')
  const atual = JSON.parse(readFileSync(arqBase, 'utf8'))
  atual.amostras = [...atual.amostras.filter(a => a.f !== 'ines'), ...amostrasInes]
  atual.fontes.ines = {
    nome: 'Dicionário da Língua Brasileira de Sinais — INES / Acessibilidade Brasil', licenca: 'uso educacional',
    url: 'https://dicionario.ines.gov.br/',
    letras: [...new Set(amostrasInes.map(a => a.rotulo))].join(' ') + ` (até ${AMOSTRAS_POR_LETRA} quadros com a mão parada por letra; vídeo de 240×176)`,
    observacao: 'Gerado por ml/alfabeto_ines.mjs com o próprio código do app (mesmos filtros da câmera).',
  }
  writeFileSync(arqBase, JSON.stringify(atual))
  writeFileSync(join(ENGINE, 'gestos-base.json'), JSON.stringify({
    _sobre: 'Letras com movimento de referência, do Dicionário da Libras do INES (uma pessoa), recortadas e '
      + 'reamostradas pelo próprio código do app (ml/alfabeto_ines.mjs). Valem até a pessoa ensinar a letra no '
      + 'aparelho (aí valem as gravações dela). limiares: distância DTW máxima aceita por letra, abaixo de todos os '
      + 'movimentos "de não-letra" dos vídeos de letras paradas.',
    fonte: 'Dicionário da Língua Brasileira de Sinais — INES (https://dicionario.ines.gov.br/), uso educacional.',
    limiares, gestos: gestosBase,
  }))
  console.log(`\nGravado: ${amostrasInes.length} amostras paradas (amostras-base.json) e ${gestosBase.length} gestos de ${Object.keys(limiares).join(', ')} (gestos-base.json).`)
}

export {letras, simular, gestos, amostrasParadas, inverter, PASSOS}

if (process.argv.includes('--linha')) {
  console.log('\nLinha do tempo (30 q/s): . sem mão · ~ mexendo · _ parada')
  for (const l of letras) {
    const qs = simular(l, inverter)
    console.log(`  ${l.letra.padEnd(2)} ` + qs.map(q => !q.mao ? '.' : q.still ? '_' : '~').join(''))
  }
}
