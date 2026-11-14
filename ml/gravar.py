"""Grava exemplos REAIS de sinais com a webcam (OpenCV + MediaPipe) para treinar o modelo.

Só os pontos são salvos (nenhuma imagem), no mesmo formato da MINDS-Libras, em
  <SIGNA_DADOS>/gravacoes/pontos/<pessoa>/<sinal>/<data-hora>.npz
Grave com várias pessoas: a avaliação separa treino e teste POR PESSOA, então um sinal
gravado por uma pessoa só não pode ser avaliado de forma honesta.

Uso:  python gravar.py --pessoa ana --sinal obrigado --palavra Obrigado --vezes 10
Cada repetição: comece com as mãos abaixadas (fora da imagem), faça o sinal e abaixe as mãos.
Teclas: ESPAÇO grava a próxima repetição · Q sai.
"""
import argparse
import time

import cv2
import numpy as np

import caracteristicas as C
import config
from extrair import Extrator


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pessoa', required=True, help='identificador de quem está sinalizando (sem nome completo)')
    ap.add_argument('--sinal', required=True, help='identificador sem acento, ex.: obrigado')
    ap.add_argument('--palavra', required=True, help='palavra em português, ex.: Obrigado')
    ap.add_argument('--vezes', type=int, default=10)
    ap.add_argument('--camera', type=int, default=0)
    a = ap.parse_args()
    destino = config.PROPRIOS_PONTOS / a.pessoa / a.sinal
    destino.mkdir(parents=True, exist_ok=True)

    cap = cv2.VideoCapture(a.camera)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    ex = Extrator()
    feitas = len(list(destino.glob('*.npz')))
    gravando, buf, seg, estado = False, None, None, {}
    t0 = time.time()
    try:
        while feitas < a.vezes:
            ok, f = cap.read()
            if not ok:
                raise SystemExit('Não foi possível ler a câmera.')
            t = time.time() - t0
            pose, maos, lado, score = ex.quadro(f, t * 1000)
            vis = cv2.flip(f, 1)
            if gravando:
                buf.append((t, pose, maos, lado, score))
                X, valido, com_mao = C.quadro_unico(pose, maos, (f.shape[1], f.shape[0]), estado)
                r = seg.push(X, valido, com_mao, t)
                msg = 'SINALIZANDO...' if seg.ativo else 'gravando: faca o sinal'
                if isinstance(r, tuple):
                    T, P, M, L, S = map(np.array, zip(*buf))
                    np.savez_compressed(destino / time.strftime('%Y%m%d-%H%M%S.npz'), t=T.astype(np.float32), pose=P, maos=M,
                                        lado=L, score=S, wh=np.array([f.shape[1], f.shape[0]], np.float32),
                                        sinal=a.sinal, palavra=a.palavra, pessoa=a.pessoa)
                    feitas += 1
                    gravando = False
                    print(f'repetição {feitas}/{a.vezes} salva')
                elif r == 'curto':
                    print('movimento curto demais, descartado; tente de novo')
                    gravando = False
                cv2.putText(vis, msg, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
            else:
                cv2.putText(vis, f'{a.palavra}: {feitas}/{a.vezes} - ESPACO grava, Q sai', (10, 30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 160, 0), 2)
            cv2.imshow('Gravar sinal (Signa)', vis)
            k = cv2.waitKey(1) & 0xFF
            if k == ord('q'):
                break
            if k == ord(' ') and not gravando:
                gravando, buf, seg, estado = True, [], C.Segmentador(), {}
    finally:
        ex.fechar()
        cap.release()
        cv2.destroyAllWindows()
    print(f'{feitas} repetições em {destino}. Depois rode: python treinar.py')


if __name__ == '__main__':
    main()
