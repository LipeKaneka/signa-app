"""Baixa os vídeos do Dicionário da Libras do INES e guarda só os pontos (MediaPipe), como na MINDS.

Educado com o site: um pedido por vez, com pausa entre eles e identificação do projeto. Cada vídeo é
apagado logo depois de virar pontos. Pode ser interrompido: na próxima execução continua de onde parou.

Saída: <SIGNA_DADOS>/ines/pontos/<sinal>/<arquivo>.npz, com os mesmos campos de extrair.py e mais:
  sinal (slug da palavra sem o número da variante), palavra, variante (1, 2, ... ou 0), ines_id, video.

Uso:
  python baixar_ines.py                 # só os sinais que o modelo já conhece (padrão)
  python baixar_ines.py --todos         # o dicionário inteiro (~5.800 vídeos; leva horas)
  python baixar_ines.py --sinais casa obrigado
"""
import argparse
import json
import re
import tempfile
import time
import unicodedata
import urllib.request
from pathlib import Path

import numpy as np

import config
import extrair

AGENTE = 'SignaLudus-escola/1.0 (trabalho escolar; uso educacional)'
PAUSA_S = 1.0


def slug(texto):
    sem_acento = ''.join(c for c in unicodedata.normalize('NFD', texto.lower()) if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', '-', sem_acento).strip('-')


def baixar(url):
    pedido = urllib.request.Request(url, headers={'User-Agent': AGENTE})
    with urllib.request.urlopen(pedido, timeout=60) as resposta:
        return resposta.read()


def listar_palavras():
    """Entradas do dicionário com vídeo: {sinal, palavra, variante, ines_id, video}."""
    texto = baixar(config.INES_PALAVRAS).decode('utf-8')
    dados = json.loads(texto[texto.index('['):texto.rindex(']') + 1])
    itens = []
    for d in dados:
        if not d.get('video', '').lower().endswith('.mp4'):
            continue
        palavra = d['palavra'].strip()
        m = re.match(r'^(.*?)(\d+)$', palavra)  # "ACONTECER2" = variante 2 de ACONTECER
        base, variante = (m.group(1), int(m.group(2))) if m and not palavra.isdigit() else (palavra, 0)
        itens.append(dict(sinal=slug(base), palavra=base.title(), variante=variante, ines_id=int(d['ident']), video=d['video']))
    return itens


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--todos', action='store_true', help='o dicionário inteiro')
    ap.add_argument('--sinais', nargs='*', help='só estes sinais (slug, ex.: obrigado)')
    a = ap.parse_args()

    itens = listar_palavras()
    if not a.todos:
        alvo = set(a.sinais or [s for s, _ in config.SINAIS_MINDS])
        itens = [it for it in itens if it['sinal'] in alvo]
    print(f'{len(itens)} vídeos do INES para processar', flush=True)

    feitos = falhas = 0
    with tempfile.TemporaryDirectory() as tmp:
        for k, it in enumerate(itens, 1):
            destino = config.INES_PONTOS / it['sinal'] / (Path(it['video']).stem + '.npz')
            if destino.exists():
                continue
            video = Path(tmp) / it['video']
            try:
                video.write_bytes(baixar(config.INES_VIDEO.format(it['video'])))
                r = extrair.extrair_video(video, recortar=False)
                destino.parent.mkdir(parents=True, exist_ok=True)
                np.savez_compressed(destino, **r, sinal=it['sinal'], palavra=it['palavra'], variante=it['variante'],
                                    ines_id=it['ines_id'], video=it['video'], pessoa='ines', fonte='ines')
                feitos += 1
            except Exception as erro:  # noqa: BLE001 — um vídeo ruim não para os outros
                falhas += 1
                print(f'falhou {it["video"]}: {erro}', flush=True)
            finally:
                video.unlink(missing_ok=True)
            if k % 25 == 0:
                print(f'{k}/{len(itens)} ({feitos} novos, {falhas} falhas)', flush=True)
            time.sleep(PAUSA_S)
    print(f'pronto: {feitos} novos, {falhas} falhas. Pontos em {config.INES_PONTOS}', flush=True)


if __name__ == '__main__':
    main()
