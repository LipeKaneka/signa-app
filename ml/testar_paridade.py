"""Confere que o app (JavaScript) calcula exatamente o mesmo que o treino (Python).

Compara, em várias gravações: as características reamostradas, o recorte do sinal em
tempo real e, se houver modelo exportado, as probabilidades da LSTM (Keras × JS).
Uso:  python testar_paridade.py [n_gravacoes]
"""
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

import caracteristicas as C
import config

APP_MODELO = config.RAIZ.parent / 'frontend' / 'public' / 'modelos' / 'sinais-dinamicos.json'


def para_js(d):
    def pts(a, com_vis=False):
        if np.isnan(a[0, 0]):
            return None
        return [dict(x=float(p[0]), y=float(p[1]), z=float(p[2]), **({'visibility': float(p[3])} if com_vis else {})) for p in a]
    quadros = []
    for i in range(len(d['t'])):
        maos = [pts(d['maos'][i, k]) for k in range(2)]
        quadros.append(dict(pose=pts(d['pose'][i], True), maos=[m for m in maos if m]))
    return dict(quadros=quadros, t=[float(x) for x in d['t']], w=float(d['wh'][0]), h=float(d['wh'][1]), passos=C.T_PASSOS)


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    arquivos = sorted(config.MINDS_PONTOS.glob('S*/*.npz'))
    if not arquivos:
        raise SystemExit('Nenhuma gravação extraída ainda.')
    arquivos = [arquivos[i] for i in np.linspace(0, len(arquivos) - 1, min(n, len(arquivos))).astype(int)]
    modelo = None
    if APP_MODELO.exists():
        import tensorflow as tf
        modelo = tf.keras.models.load_model(config.SAIDA / 'sinais-dinamicos.keras')
        norm = np.load(config.SAIDA / 'normalizacao.npz')
    pior_carac, pior_prob, falhas = 0.0, 0.0, 0
    for f in arquivos:
        d = dict(np.load(f))
        seq = C.sequencia(d)
        if seq is None:
            print(f'{f.name}: sem mão, ignorado')
            continue
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as tmp:
            json.dump(para_js(d), tmp)
        cmd = ['node', str(config.RAIZ / 'paridade.mjs'), tmp.name] + ([str(APP_MODELO)] if modelo else [])
        js = json.loads(subprocess.run(cmd, capture_output=True, text=True, check=True).stdout)
        Path(tmp.name).unlink()
        dif = float(np.abs(np.array(js['seq'], np.float32) - seq).max())
        pior_carac = max(pior_carac, dif)
        linha = f'{f.parent.name}/{f.name} ({d["palavra"]}): dif. máx. características {dif:.2e}'
        rt, rr = js['recorteTreino'], js['recorteTempoReal']
        if rr is None:
            linha += ' · tempo real: nenhum recorte!'
            falhas += 1
        else:
            linha += f" · recorte treino {rt['t0']:.2f}–{rt['t1']:.2f}s, tempo real {rr['t0']:.2f}–{rr['t1']:.2f}s"
        if modelo:
            p_py = modelo.predict(((seq - norm['media']) / norm['desvio'])[None], verbose=0)[0]
            dp = float(np.abs(p_py - np.array(js['prob'])).max())
            pior_prob = max(pior_prob, dp)
            linha += f' · dif. prob. {dp:.2e}'
        print(linha)
    ok = pior_carac < 1e-4 and (not modelo or pior_prob < 1e-4)
    print(f"\n{'OK' if ok else 'DIVERGÊNCIA'}: maior diferença nas características {pior_carac:.2e}"
          + (f', nas probabilidades {pior_prob:.2e}' if modelo else ' (sem modelo exportado para comparar probabilidades)')
          + (f'; {falhas} gravações sem recorte em tempo real' if falhas else ''))
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
