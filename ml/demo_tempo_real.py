"""Demonstração em tempo real com a webcam (OpenCV + MediaPipe + LSTM em Keras).

Só roda se o último treino foi APROVADO na avaliação por pessoa (relatorios/sinais-dinamicos.json).
Comece com as mãos abaixadas, faça o sinal e abaixe as mãos. Q sai.
Uso:  python demo_tempo_real.py [--camera 0]
"""
import argparse
import json
import os
import time

os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '2')
import cv2
import numpy as np

import caracteristicas as C
import config
from extrair import Extrator


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--camera', type=int, default=0)
    a = ap.parse_args()
    rel_arq = config.RAIZ / 'relatorios' / 'sinais-dinamicos.json'
    if not rel_arq.exists():
        raise SystemExit('Treine e avalie o modelo antes: python treinar.py')
    rel = json.loads(rel_arq.read_text(encoding='utf-8'))
    if not rel['aprovado']:
        raise SystemExit('O último modelo foi REPROVADO na avaliação por pessoa; não será usado em tempo real. '
                         'Veja relatorios/sinais-dinamicos.md.')
    import tensorflow as tf
    modelo = tf.keras.models.load_model(config.SAIDA / 'sinais-dinamicos.keras')
    norm = np.load(config.SAIDA / 'normalizacao.npz')
    palavras = rel['dados']['sinais']
    limiar = float(norm['limiar'])

    cap = cv2.VideoCapture(a.camera)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    ex, seg, estado = Extrator(), C.Segmentador(), {}
    texto, ultimo, t0 = [], 'Comece com as maos abaixadas', time.time()
    try:
        while True:
            ok, f = cap.read()
            if not ok:
                break
            t = time.time() - t0
            pose, maos, _, _ = ex.quadro(f, t * 1000)
            X, valido, com_mao = C.quadro_unico(pose, maos, (f.shape[1], f.shape[0]), estado)
            r = seg.push(X, valido, com_mao, t)
            if isinstance(r, tuple):
                seq = C.reamostrar(*r)
                p = modelo.predict(((seq - norm['media']) / norm['desvio'])[None], verbose=0)[0]
                k = int(p.argmax())
                if p[k] >= limiar:
                    texto.append(palavras[k])
                    ultimo = f'{palavras[k]} ({p[k]:.0%})'
                else:
                    ultimo = f'nao reconhecido (parece {palavras[k]}, {p[k]:.0%})'
            elif r == 'curto':
                ultimo = 'movimento curto demais'
            vis = cv2.flip(f, 1)
            for m in maos:
                if not np.isnan(m[0, 0]):
                    for x, y, _ in m:
                        cv2.circle(vis, (int((1 - x) * vis.shape[1]), int(y * vis.shape[0])), 3, (0, 165, 255), -1)
            cv2.putText(vis, 'SINALIZANDO...' if seg.ativo else ultimo, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
            cv2.putText(vis, ' '.join(texto[-6:]), (10, vis.shape[0] - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
            cv2.imshow('Sinais dinamicos (Signa)', vis)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
    finally:
        ex.fechar()
        cap.release()
        cv2.destroyAllWindows()


if __name__ == '__main__':
    main()
