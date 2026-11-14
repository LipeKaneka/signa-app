"""Extrai, quadro a quadro, os pontos brutos de mãos e corpo de um vídeo com MediaPipe.

Guarda tudo (não só as características usadas hoje) para poder mudar o pré-processamento
sem reprocessar os vídeos. Formato de saída (.npz):
  t      (T,)        tempo do quadro em segundos
  pose   (T, 33, 4)  x, y, z, visibilidade (NaN se não houve pose)
  maos   (T, 2, 21, 3) x, y, z de até 2 mãos (NaN se ausente)
  lado   (T, 2)      1 = 'Right', 0 = 'Left' segundo o MediaPipe, -1 ausente
  score  (T, 2)      confiança da lateralidade
  wh     (2,)        largura e altura (px) da imagem analisada, para corrigir a proporção
"""
import cv2
import mediapipe as mp
import numpy as np

import config

BaseOptions = mp.tasks.BaseOptions
V = mp.tasks.vision


class Extrator:
    def __init__(self):
        self.mao = V.HandLandmarker.create_from_options(V.HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(config.MAO_TASK)),
            running_mode=V.RunningMode.VIDEO, **config.OPCOES_MAO))
        self.pose = V.PoseLandmarker.create_from_options(V.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(config.POSE_TASK)),
            running_mode=V.RunningMode.VIDEO, **config.OPCOES_POSE))
        self.ultimo_ms = -1

    def quadro(self, bgr, t_ms):
        """Analisa um quadro BGR (OpenCV). Os carimbos de tempo precisam crescer sempre."""
        t_ms = max(int(t_ms), self.ultimo_ms + 1)
        self.ultimo_ms = t_ms
        img = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        rm = self.mao.detect_for_video(img, t_ms)
        rp = self.pose.detect_for_video(img, t_ms)
        pose = np.full((33, 4), np.nan, np.float32)
        if rp.pose_landmarks:
            pose[:] = [(p.x, p.y, p.z, p.visibility) for p in rp.pose_landmarks[0]]
        maos = np.full((2, 21, 3), np.nan, np.float32)
        lado = np.full(2, -1, np.int8)
        score = np.zeros(2, np.float32)
        for k, pts in enumerate(rm.hand_landmarks[:2]):
            maos[k] = [(p.x, p.y, p.z) for p in pts]
            h = rm.handedness[k][0]
            lado[k] = 1 if h.category_name == 'Right' else 0
            score[k] = h.score
        return pose, maos, lado, score

    def fechar(self):
        self.mao.close()
        self.pose.close()


def recorte_central(bgr, frac=0.6):
    """Recorta a faixa central (a pessoa fica no meio nos vídeos da MINDS) para as mãos ficarem maiores."""
    w = bgr.shape[1]
    lw = int(w * frac)
    x0 = (w - lw) // 2
    return bgr[:, x0:x0 + lw]


def extrair_video(caminho, recortar=True, largura_max=960):
    cap = cv2.VideoCapture(str(caminho))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    ex = Extrator()
    ts, P, M, L, S = [], [], [], [], []
    wh = None
    i = 0
    try:
        while True:
            ok, f = cap.read()
            if not ok:
                break
            if recortar:
                f = recorte_central(f)
            if f.shape[1] > largura_max:
                k = largura_max / f.shape[1]
                f = cv2.resize(f, None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
            wh = (f.shape[1], f.shape[0])
            t = i / fps
            p, m, l, s = ex.quadro(f, t * 1000)
            ts.append(t); P.append(p); M.append(m); L.append(l); S.append(s)
            i += 1
    finally:
        cap.release()
        ex.fechar()
    if not ts:
        raise RuntimeError(f'nenhum quadro lido em {caminho}')
    return dict(t=np.array(ts, np.float32), pose=np.stack(P), maos=np.stack(M), lado=np.stack(L),
                score=np.stack(S), wh=np.array(wh, np.float32))


if __name__ == '__main__':
    import sys
    r = extrair_video(sys.argv[1])
    presenca = (~np.isnan(r['maos'][:, :, 0, 0])).sum(0)
    print(len(r['t']), 'quadros; mãos detectadas por slot:', presenca, '; pose em',
          int((~np.isnan(r['pose'][:, 0, 0])).sum()), 'quadros')
