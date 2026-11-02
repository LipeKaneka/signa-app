// Transforma a sequência de reconhecimentos (um por quadro) em texto.
// Uma letra só é escrita depois de ficar estável por alguns quadros, e a mesma
// letra só se repete se a mão sair de cena ou mudar de sinal antes.

export const ESTAVEL = 12 // ~0,4 s a 30 fps
export const CONF_MIN = 0.6
export const AUSENCIA_LIBERA = 8

export const estadoInicial = () => ({rot: null, n: 0, travado: null, ausente: 0})

/**
 * Processa um quadro. r = {rotulo, confianca} do classificador, ou null se não há mão.
 * Devolve {estado, escrever} — escrever é o rótulo a acrescentar ao texto, ou null.
 */
export function processar(e, r, estavel = ESTAVEL, confMin = CONF_MIN) {
  if (!r) {
    const ausente = e.ausente + 1
    return {estado: {rot: null, n: 0, ausente, travado: ausente > AUSENCIA_LIBERA ? null : e.travado}, escrever: null}
  }
  const base = {...e, ausente: 0}
  if (!r.rotulo || r.confianca < confMin) return {estado: {...base, rot: null, n: 0}, escrever: null}
  if (r.rotulo !== e.rot) {
    return {estado: {...base, rot: r.rotulo, n: 1, travado: r.rotulo === e.travado ? e.travado : null}, escrever: null}
  }
  const n = e.n + 1
  if (n === estavel && e.travado !== r.rotulo) return {estado: {...base, n, travado: r.rotulo}, escrever: r.rotulo}
  return {estado: {...base, n}, escrever: null}
}

/** Acrescenta ao texto: letras juntas; palavras (rótulos com mais de 1 caractere) separadas por espaço. */
export function acrescentar(texto, rotulo) {
  if (rotulo.length === 1) return texto + rotulo
  return texto + (texto && !texto.endsWith(' ') ? ' ' : '') + rotulo + ' '
}
