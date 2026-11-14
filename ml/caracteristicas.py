"""Características por quadro e recorte do sinal, a partir dos pontos brutos (extrair.py).

ATENÇÃO: frontend/src/features/translator/engine/dinamicos.js implementa exatamente as mesmas contas para o app.
Se mudar algo aqui, mude lá também (o teste `python testar_paridade.py` confere).

Por quadro (154 valores):
  corpo  11 pontos da pose (nariz, olhos, boca, ombros, cotovelos, punhos), x/y relativos
         ao centro dos ombros e divididos pela largura dos ombros            -> 22
  mão A/B presença (0/1), punho relativo ao corpo (2) e formato: 21 pontos x/y/z
         relativos ao punho e divididos pelo tamanho da palma (63)          -> 66 cada
A mão A é a mais próxima do punho direito da pessoa (pose 16); a B, do esquerdo (15).
"""
import numpy as np

CORPO = [0, 2, 5, 9, 10, 11, 12, 13, 14, 15, 16]
# Pares esquerda/direita da pose (para espelhar)
PARES_POSE = [(1, 4), (2, 5), (3, 6), (7, 8), (9, 10), (11, 12), (13, 14), (15, 16), (17, 18),
              (19, 20), (21, 22), (23, 24), (25, 26), (27, 28), (29, 30), (31, 32)]
N_CORPO = len(CORPO) * 2
N_MAO = 66
N_CARAC = N_CORPO + 2 * N_MAO
T_PASSOS = 24          # quadros por sequência após reamostragem
FOLGA = 2              # quadros extras antes/depois do trecho com mão


def caracteristicas(pose, maos, wh):
    """pose (T,33,4), maos (T,2,21,3), wh (2,) -> X (T,154), valido (T,) bool."""
    T = len(pose)
    w, h = float(wh[0]), float(wh[1])
    X = np.zeros((T, N_CARAC), np.float32)
    valido = np.zeros(T, bool)
    ref = None
    for i in range(T):
        p = pose[i]
        if not np.isnan(p[11, 0]) and not np.isnan(p[12, 0]):
            ls = np.array([p[11, 0] * w, p[11, 1] * h])
            rs = np.array([p[12, 0] * w, p[12, 1] * h])
            esc = float(np.hypot(*(ls - rs)))
            if esc > 1e-3:
                ref = ((ls + rs) / 2, esc, p)
        if ref is None:
            continue
        c, esc, pr = ref
        valido[i] = True
        corpo = (np.stack([pr[CORPO, 0] * w, pr[CORPO, 1] * h], 1) - c) / esc
        X[i, :N_CORPO] = corpo.reshape(-1)
        # punhos da pose (direito = 16, esquerdo = 15) para decidir qual mão é qual
        pd = (np.array([pr[16, 0] * w, pr[16, 1] * h]) - c) / esc
        pe = (np.array([pr[15, 0] * w, pr[15, 1] * h]) - c) / esc
        presentes = [k for k in range(2) if not np.isnan(maos[i, k, 0, 0])]
        feitas = []
        for k in presentes:
            m = maos[i, k]
            px = np.stack([m[:, 0] * w, m[:, 1] * h, m[:, 2] * w], 1)
            punho = (px[0, :2] - c) / esc
            feitas.append((k, px, punho))
        slots = atribuir_slots([f[2] for f in feitas], pd, pe)
        for (k, px, punho), s in zip(feitas, slots):
            palma = float(np.hypot(*(px[9, :2] - px[0, :2])))
            if palma < 1e-3:
                continue
            forma = (px - px[0]) / palma
            o = N_CORPO + s * N_MAO
            X[i, o] = 1.0
            X[i, o + 1:o + 3] = punho
            X[i, o + 3:o + N_MAO] = forma.reshape(-1)
    return X, valido


def atribuir_slots(punhos, pd, pe):
    """0 = mão do lado direito da pessoa, 1 = esquerdo (pelo punho da pose mais próximo)."""
    if not punhos:
        return []
    if len(punhos) == 1:
        d0 = np.hypot(*(punhos[0] - pd))
        d1 = np.hypot(*(punhos[0] - pe))
        return [0 if d0 <= d1 else 1]
    a, b = punhos[:2]
    direto = np.hypot(*(a - pd)) + np.hypot(*(b - pe))
    trocado = np.hypot(*(a - pe)) + np.hypot(*(b - pd))
    return [0, 1] if direto <= trocado else [1, 0]


def trecho_ativo(X, valido):
    """Índices [ini, fim) do trecho em que há alguma mão (o sinal vai de repouso a repouso)."""
    com_mao = valido & ((X[:, N_CORPO] > 0) | (X[:, N_CORPO + N_MAO] > 0))
    idx = np.flatnonzero(com_mao)
    if len(idx) < 3:
        return None
    return max(0, idx[0] - FOLGA), min(len(X), idx[-1] + 1 + FOLGA)


def reamostrar(X, t, n=T_PASSOS):
    """Escolhe n quadros igualmente espaçados no tempo (vizinho mais próximo)."""
    alvo = np.linspace(t[0], t[-1], n)
    j = np.clip(np.searchsorted(t, alvo), 0, len(t) - 1)
    j0 = np.clip(j - 1, 0, len(t) - 1)
    j = np.where(np.abs(t[j0] - alvo) <= np.abs(t[j] - alvo), j0, j)
    return X[j]


class Segmentador:
    """Recorte em tempo real (igual ao Segmentador de frontend/src/features/translator/engine/dinamicos.js).

    Um sinal começa quando alguma mão aparece e termina quando as mãos somem por `pausa` s.
    push(X, valido, com_mao, t) devolve (Xs, ts) do sinal completo, 'curto' ou None.
    """

    def __init__(self, pausa=0.5, duracao_min=0.3, quadros_min=5, duracao_max=6.0):
        self.pausa, self.duracao_min, self.quadros_min, self.duracao_max = pausa, duracao_min, quadros_min, duracao_max
        self.reiniciar()

    def reiniciar(self):
        self.antes, self.buf, self.ultima_mao = [], None, -1

    @property
    def ativo(self):
        return self.buf is not None

    def push(self, X, valido, com_mao, t):
        q = (X, valido, com_mao, t)
        if self.buf is None:
            if not com_mao:
                self.antes = (self.antes + [q])[-FOLGA:]
                return None
            self.buf, self.antes = self.antes + [q], []
            self.ultima_mao = len(self.buf) - 1
            return None
        self.buf.append(q)
        if com_mao:
            self.ultima_mao = len(self.buf) - 1
        t_ult = self.buf[self.ultima_mao][3]
        com_maos = [b for b in self.buf if b[2]]
        durou = t_ult - com_maos[0][3]
        if t - t_ult < self.pausa and durou < self.duracao_max:
            return None
        trecho = [b for b in self.buf[:self.ultima_mao + 1 + FOLGA] if b[1]]
        self.reiniciar()
        if durou < self.duracao_min or len(com_maos) < self.quadros_min or len(trecho) < 3:
            return 'curto'
        return np.stack([b[0] for b in trecho]), np.array([b[3] for b in trecho])


def quadro_unico(pose, maos, wh, estado):
    """Características de um quadro em tempo real, carregando a referência do corpo em `estado`
    (dict). pose (33,4) com NaN se ausente; maos (2,21,3) com NaN onde não houver mão."""
    if 'pose_ref' in estado and np.isnan(pose[11, 0]):
        pose_uso = estado['pose_ref']
    else:
        pose_uso = pose
    X, valido = caracteristicas(pose_uso[None], maos[None], wh)
    if valido[0]:
        estado['pose_ref'] = pose_uso
    com_mao = bool(valido[0] and (X[0, N_CORPO] > 0 or X[0, N_CORPO + N_MAO] > 0))
    return X[0], bool(valido[0]), com_mao


def espelhar_bruto(pose, maos, lado):
    """Espelha horizontalmente os pontos brutos (simula a pessoa sinalizar com a outra mão)."""
    pose = pose.copy()
    maos = maos.copy()
    pose[..., 0] = 1 - pose[..., 0]
    maos[..., 0] = 1 - maos[..., 0]
    maos[..., 2] = maos[..., 2]
    for a, b in PARES_POSE:
        pose[:, [a, b]] = pose[:, [b, a]]
    lado = np.where(lado >= 0, 1 - lado, lado)
    return pose, maos, lado


def sequencia(d, espelhar=False):
    """Do .npz bruto à sequência (T_PASSOS, N_CARAC). Devolve None se não houver sinal."""
    pose, maos, lado = d['pose'], d['maos'], d['lado']
    if espelhar:
        pose, maos, lado = espelhar_bruto(pose, maos, lado)
    X, valido = caracteristicas(pose, maos, d['wh'])
    tr = trecho_ativo(X, valido)
    if tr is None:
        return None
    a, b = tr
    sel = valido[a:b]
    if sel.sum() < 3:
        return None
    return reamostrar(X[a:b][sel], d['t'][a:b][sel])
