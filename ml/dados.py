"""Carrega as gravações (MINDS-Libras, próprias e INES) e gera sequências com aumento de dados."""
from pathlib import Path

import numpy as np

import caracteristicas as C
import config


def carregar_gravacoes(incluir_proprias=True, incluir_ines=True):
    """Lista de dicts: {X, valido, t, sinal, palavra, pessoa, origem, arquivo} (com e sem espelho).

    INES: só entram sinais que o modelo já conhece (das outras fontes), uma variante por sinal — a mais
    parecida com as gravações das outras pessoas (ver escolher_variantes_ines).
    """
    arquivos = sorted(config.MINDS_PONTOS.glob('S*/*.npz'))
    if incluir_proprias and config.PROPRIOS_PONTOS.exists():
        arquivos += sorted(config.PROPRIOS_PONTOS.glob('*/*/*.npz'))
    itens = [it for f in arquivos if (it := ler_gravacao(f))]
    if incluir_ines and config.INES_PONTOS.exists():
        vocabulario = {it['sinal']: it['palavra'] for it in itens}
        ines = [it for f in sorted(config.INES_PONTOS.glob('*/*.npz')) if f.parent.name in vocabulario
                and (it := ler_gravacao(f, vocabulario))]
        itens += escolher_variantes_ines(itens, ines)
    return itens


def ler_gravacao(f, vocabulario=None):
    d = dict(np.load(f, allow_pickle=False))
    if 'sinalizador' in d:
        pessoa, origem, palavra = f"minds-{int(d['sinalizador']):02d}", 'minds', str(d['palavra'])
    elif 'ines' in (str(d.get('fonte', '')), str(d.get('pessoa', ''))):
        # mesma palavra do vocabulário (a do INES pode ter número de variante, ex.: "ACONTECER2")
        pessoa, origem, palavra = 'ines', 'ines', vocabulario[str(d['sinal'])]
    else:
        pessoa, origem, palavra = f"proprio-{str(d['pessoa'])}", 'proprio', str(d['palavra'])
    it = dict(sinal=str(d['sinal']), palavra=palavra, pessoa=pessoa, origem=origem, arquivo=str(f))
    if origem == 'ines':
        it['ines_palavra'] = str(d['palavra'])
    for esp in (False, True):
        pose, maos = d['pose'], d['maos']
        if esp:
            pose, maos, _ = C.espelhar_bruto(pose, maos, d['lado'])
        X, valido = C.caracteristicas(pose, maos, d['wh'])
        it['X_esp' if esp else 'X'] = X
        it['valido'] = valido  # o espelho não muda quais quadros são válidos
    it['t'] = d['t']
    tr = C.trecho_ativo(it['X'], it['valido'])
    if tr is None:
        it['descartado'] = 'nenhuma mão detectada'
    return it


def escolher_variantes_ines(itens, ines):
    """O INES às vezes tem várias variantes de um sinal (ACONTECER1, 2, 3) e nem sempre a mesma das outras
    pessoas. Fica a variante mais próxima da média das outras gravações daquele sinal, e só se ela estiver
    mais perto do próprio sinal do que de qualquer outro (senão é outro jeito de sinalizar: fica de fora)."""
    validos = [it for it in itens if 'descartado' not in it]
    if not validos:
        return []
    seq = lambda it: sequencia_de(it).ravel()
    base = np.stack([seq(it) for it in validos])
    escala = base.std(0) + 1e-6
    sinais = sorted({it['sinal'] for it in validos})
    centro = {s: (np.stack([seq(it) for it in validos if it['sinal'] == s]) / escala).mean(0) for s in sinais}
    escolhidos = []
    for s in sinais:
        candidatos = [it for it in ines if it['sinal'] == s and 'descartado' not in it]
        melhor = None
        for it in candidatos:
            v = seq(it) / escala
            dist = {k: float(np.linalg.norm(v - c)) for k, c in centro.items()}
            if min(dist, key=dist.get) == s and (melhor is None or dist[s] < melhor[0]):
                melhor = (dist[s], it)
        if melhor:
            escolhidos.append(melhor[1])
    return escolhidos


def sequencia_de(it, esp=False, rng=None):
    """Sequência (T_PASSOS, N_CARAC). Com `rng`, aplica aumento de dados aleatório."""
    X = it['X_esp'] if esp else it['X']
    valido, t = it['valido'], it['t']
    a, b = C.trecho_ativo(it['X'], valido)
    if rng is not None:
        # corta um pouco do início/fim (pessoas começam e terminam em momentos diferentes)
        n = b - a
        a += int(rng.integers(0, max(1, int(0.12 * n))))
        b -= int(rng.integers(0, max(1, int(0.12 * n))))
        if b - a < 4:
            a, b = C.trecho_ativo(it['X'], valido)
    sel = valido[a:b]
    Xs, ts = X[a:b][sel].copy(), t[a:b][sel]
    if rng is not None:
        # falhas de detecção: some a mão em alguns quadros
        for s in range(2):
            o = C.N_CORPO + s * C.N_MAO
            perde = rng.random(len(Xs)) < 0.08
            Xs[perde, o:o + C.N_MAO] = 0
        # variação de velocidade: reamostragem com tempo levemente distorcido
        if len(ts) > 2:
            dur = ts[-1] - ts[0]
            k = rng.uniform(0.8, 1.25)
            u = (ts - ts[0]) / max(dur, 1e-6)
            ts = ts[0] + dur * u ** k
    seq = C.reamostrar(Xs, ts)
    if rng is not None:
        seq = geometria(seq, rng)
    return seq


def geometria(seq, rng):
    """Pequena rotação/escala/deslocamento do corpo inteiro e ruído (câmeras e corpos diferentes)."""
    seq = seq.copy()
    ang = np.deg2rad(rng.uniform(-10, 10))
    esc = rng.uniform(0.9, 1.1)
    desl = rng.normal(0, 0.05, 2)
    R = np.array([[np.cos(ang), -np.sin(ang)], [np.sin(ang), np.cos(ang)]]) * esc
    corpo = seq[:, :C.N_CORPO].reshape(len(seq), -1, 2)
    seq[:, :C.N_CORPO] = (corpo @ R.T + desl).reshape(len(seq), -1)
    for s in range(2):
        o = C.N_CORPO + s * C.N_MAO
        pres = seq[:, o] > 0
        punho = seq[:, o + 1:o + 3]
        seq[:, o + 1:o + 3] = np.where(pres[:, None], punho @ R.T + desl, 0)
        forma = seq[:, o + 3:o + C.N_MAO].reshape(len(seq), 21, 3)
        xy = forma[..., :2] @ (R / esc).T  # o formato da mão já é normalizado pela palma
        forma = np.concatenate([xy, forma[..., 2:]], -1)
        forma += rng.normal(0, 0.02, forma.shape) * pres[:, None, None]
        seq[:, o + 3:o + C.N_MAO] = forma.reshape(len(seq), -1)
    return seq.astype(np.float32)
