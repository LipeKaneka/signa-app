"""Alfabeto do Dicionário da Libras do INES: pontos da mão principal, quadro a quadro, de cada letra (A–Z e Ç).

Saída: <SIGNA_DADOS>/ines/alfabeto/<LETRA>.json — o formato que ml/alfabeto_ines.mjs lê para gerar, com o
próprio código do app, as amostras de letras paradas e os gestos das letras com movimento (H, J, K, X, Z, Ç).
Só os pontos ficam guardados; o vídeo é apagado logo depois.

Uso:  python alfabeto_ines.py
"""
import json
import tempfile
import time
import urllib.parse
from pathlib import Path

import numpy as np

import config
import extrair
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


def mao_principal(r, k):
    """Como maoPrincipal do app: a mão com maior confiança de lateralidade no quadro k."""
    presentes = [s for s in range(2) if not np.isnan(r['maos'][k, s, 0, 0])]
    if not presentes:
        return None
    s = max(presentes, key=lambda i: r['score'][k, i])
    return dict(pontos=np.round(r['maos'][k, s], 5).tolist(), lado='Right' if r['lado'][k, s] == 1 else 'Left',
                score=round(float(r['score'][k, s]), 4))


def main():
    SAIDA.mkdir(parents=True, exist_ok=True)
    videos = videos_das_letras()
    faltam = [l for l in LETRAS if l not in videos]
    if faltam:
        print('Sem vídeo no INES:', ', '.join(faltam))
    with tempfile.TemporaryDirectory() as tmp:
        for letra in LETRAS:
            destino = SAIDA / f'{letra}.json'
            if destino.exists() or letra not in videos:
                continue
            video = Path(tmp) / 'letra.mp4'
            nome = baixar_video(letra, videos[letra], video)
            if not nome:
                continue
            videos[letra] = nome
            r = extrair.extrair_video(video, recortar=False)
            fps = round(1 / float(np.median(np.diff(r['t']))), 2) if len(r['t']) > 1 else 12.0
            quadros = [dict(t=round(float(r['t'][k]), 4), mao=mao_principal(r, k)) for k in range(len(r['t']))]
            destino.write_text(json.dumps(dict(letra=letra, video=videos[letra], fps=fps, w=int(r['wh'][0]), h=int(r['wh'][1]),
                                               quadros=quadros)), encoding='utf-8')
            com_mao = sum(1 for q in quadros if q['mao'])
            print(f'{letra}: {len(quadros)} quadros, mão em {com_mao}', flush=True)
            video.unlink(missing_ok=True)
            time.sleep(PAUSA_S)
    print('Pronto:', SAIDA)


if __name__ == '__main__':
    main()
