"""Alfabeto do Dicionário da Libras do INES: pontos da mão principal, quadro a quadro, de cada letra (A–Z e Ç).

Saída: <SIGNA_DADOS>/ines/alfabeto/<LETRA>.json — o formato que ml/alfabeto_ines.mjs lê para gerar, com o
próprio código do app, as amostras de letras paradas e os gestos das letras com movimento (H, J, K, X, Z, Ç).
Só os pontos ficam guardados; o vídeo é apagado logo depois.

A mão é procurada em cada quadro separado (modo IMAGEM, confiança 0,3): no modo VÍDEO o MediaPipe segue a mão
de um quadro para o outro e a perde nos movimentos rápidos destes vídeos pequenos (240×176, 12 quadros/s) — o
arco do J, por exemplo, só aparece inteiro assim.

Uso:  python alfabeto_ines.py [--refazer]
"""
import argparse
import json
import tempfile
import time
import urllib.parse
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np

import config
from baixar_ines import PAUSA_S, baixar

LETRAS = list('ABCDEFGHIJKLMNOPQRSTUVWXYZ') + ['Ç']
SAIDA = config.DADOS / 'ines' / 'alfabeto'
# O arquivo da lista não existe no site (404), mas o vídeo está com outro nome. (Y não tem vídeo nenhum.)
NOMES_ALTERNATIVOS = {'Ç': 'cedilhaSm_Prog001.mp4'}


def videos_das_letras():
    texto = baixar(config.INES_PALAVRAS).decode('utf-8')
    entradas = json.loads(texto[texto.index('['):texto.rindex(']') + 1])
    return {e['palavra'].strip(): e['video'] for e in entradas if e['palavra'].strip() in LETRAS and e.get('video')}


def baixar_video(letra, nome, destino):
    """Baixa o vídeo da letra (ou o de nome alternativo, se o da lista não existir). Devolve o nome usado ou None."""
    for candidato in filter(None, [nome, NOMES_ALTERNATIVOS.get(letra)]):
        try:
            destino.write_bytes(baixar(config.INES_VIDEO.format(urllib.parse.quote(candidato))))
            return candidato
        except Exception as erro:  # noqa: BLE001 — o site não tem alguns vídeos (404)
            ultimo = erro
    print(f'{letra}: sem vídeo ({ultimo})', flush=True)
    return None


def pontos_por_quadro(caminho):
    """Mão principal em cada quadro (como maoPrincipal do app: a de maior confiança de lateralidade)."""
    detector = mp.tasks.vision.HandLandmarker.create_from_options(mp.tasks.vision.HandLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(config.MAO_TASK)),
        running_mode=mp.tasks.vision.RunningMode.IMAGE, num_hands=2,
        min_hand_detection_confidence=0.3, min_hand_presence_confidence=0.3))
    cap = cv2.VideoCapture(str(caminho))
    fps = cap.get(cv2.CAP_PROP_FPS) or 12.0
    quadros, wh, i = [], None, 0
    try:
        while True:
            ok, f = cap.read()
            if not ok:
                break
            wh = (f.shape[1], f.shape[0])
            r = detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(f, cv2.COLOR_BGR2RGB)))
            mao = None
            if r.hand_landmarks:
                k = max(range(len(r.handedness)), key=lambda j: r.handedness[j][0].score)
                h = r.handedness[k][0]
                mao = dict(pontos=[[round(p.x, 5), round(p.y, 5), round(p.z, 5)] for p in r.hand_landmarks[k]],
                           lado=h.category_name, score=round(h.score, 4))
            quadros.append(dict(t=round(i / fps, 4), mao=mao))
            i += 1
    finally:
        cap.release()
        detector.close()
    return quadros, round(fps, 2), wh


def main():
    a = argparse.ArgumentParser()
    a.add_argument('--refazer', action='store_true', help='extrai de novo as letras já salvas')
    refazer = a.parse_args().refazer
    SAIDA.mkdir(parents=True, exist_ok=True)
    videos = videos_das_letras()
    faltam = [l for l in LETRAS if l not in videos]
    if faltam:
        print('Sem vídeo no INES:', ', '.join(faltam))
    with tempfile.TemporaryDirectory() as tmp:
        for letra in LETRAS:
            destino = SAIDA / f'{letra}.json'
            if (destino.exists() and not refazer) or letra not in videos:
                continue
            video = Path(tmp) / 'letra.mp4'
            nome = baixar_video(letra, videos[letra], video)
            if not nome:
                continue
            videos[letra] = nome
            quadros, fps, (w, h) = pontos_por_quadro(video)
            destino.write_text(json.dumps(dict(letra=letra, video=videos[letra], fps=fps, w=w, h=h, quadros=quadros)),
                               encoding='utf-8')
            com_mao = sum(1 for q in quadros if q['mao'])
            print(f'{letra}: {len(quadros)} quadros, mão em {com_mao}', flush=True)
            video.unlink(missing_ok=True)
            time.sleep(PAUSA_S)
    print('Pronto:', SAIDA)


if __name__ == '__main__':
    main()
