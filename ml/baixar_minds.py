"""Baixa a MINDS-Libras (Zenodo, CC BY 4.0) vídeo a vídeo e guarda só os pontos extraídos.

O Zenodo limita cada conexão (~0,1 MB/s), então muitos vídeos são baixados ao mesmo
tempo, cada um direto do .zip remoto por HTTP Range (sem baixar o .zip inteiro). Cada
vídeo baixado vai para um processo que roda o MediaPipe, salva os pontos e apaga o vídeo.
Nenhum vídeo fica guardado. Pode ser interrompido: na próxima execução continua.

Uso:  python baixar_minds.py [--sinalizadores 1 2 ...] [--conexoes 64] [--processos 6]
"""
import argparse
import json
import os
import re
import struct
import sys
import threading
import time
import traceback
import zipfile
import zlib
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np

import config
import zip_remoto

TMP = config.DADOS / 'minds-libras' / 'tmp'
LOG = config.DADOS / 'minds-libras' / 'progresso.log'
PADRAO = re.compile(r'^(\d{2})([^\d/]+?)Sinalizador(\d{1,2})-(\d+)\.mp4$', re.I)
_trava_log = threading.Lock()


def log(msg):
    linha = time.strftime('%H:%M:%S ') + msg
    with _trava_log:
        print(linha, flush=True)
        with open(LOG, 'a', encoding='utf-8') as f:
            f.write(linha + '\n')


def listar(s):
    """Lê só o diretório central do .zip remoto e devolve onde está cada vídeo."""
    url = config.MINDS_URL.format(s)
    z = zipfile.ZipFile(zip_remoto.ArquivoRemoto(url))
    tarefas = []
    # Os .zip grandes foram feitos no macOS, que grava deslocamentos de 32 bits que "dão a
    # volta" depois de 4 GB. Como os membros estão em ordem, reconstruímos o valor real.
    voltas, anterior = 0, -1
    for i in z.infolist():
        baixo = i.header_offset & 0xFFFFFFFF
        if baixo < anterior:
            voltas += 1
        anterior = baixo
        i.header_offset = baixo + (voltas << 32)
        nome = i.filename.split('/')[-1]
        if i.filename.startswith('__MACOSX') or not nome.lower().endswith('.mp4'):
            continue
        m = PADRAO.match(nome)
        if not m:
            log(f'AVISO nome fora do padrão, ignorado: {i.filename}')
            continue
        num, _, _, rep = m.groups()
        tarefas.append(dict(url=url, membro=i.filename, sinalizador=s, sinal=int(num) - 1, rep=int(rep),
                            offset=i.header_offset, comprimido=i.compress_size, tamanho=i.file_size,
                            metodo=i.compress_type, crc=i.CRC))
    return tarefas


def destino(t):
    return config.MINDS_PONTOS / f"S{t['sinalizador']:02d}" / f"{t['sinal'] + 1:02d}-{t['rep']}.npz"


def baixar(t):
    """Baixa um vídeo numa só requisição (cabeçalho local + dados) e confere o CRC."""
    n_nome = len(t['membro'].encode('utf-8'))
    folga = 30 + n_nome + 512  # o campo "extra" local costuma ter poucas dezenas de bytes
    bruto = zip_remoto.baixar_faixa(t['url'], t['offset'], t['offset'] + folga + t['comprimido'] - 1)
    if bruto[:4] != b'PK\x03\x04':
        raise RuntimeError('cabeçalho local inválido')
    n_nome, n_extra = struct.unpack('<HH', bruto[26:30])
    ini = 30 + n_nome + n_extra
    dados = bruto[ini:ini + t['comprimido']]
    if len(dados) < t['comprimido']:  # extra local maior que a folga: busca o resto
        falta = t['comprimido'] - len(dados)
        inicio_resto = t['offset'] + len(bruto)
        dados += zip_remoto.baixar_faixa(t['url'], inicio_resto, inicio_resto + falta - 1)
    del bruto
    if t['metodo'] == zipfile.ZIP_DEFLATED:
        dados = zlib.decompress(dados, -15)
    elif t['metodo'] != zipfile.ZIP_STORED:
        raise RuntimeError(f"compressão {t['metodo']} não suportada")
    if zlib.crc32(dados) != t['crc'] or len(dados) != t['tamanho']:
        raise RuntimeError('CRC/tamanho não confere')
    tmp = TMP / f"S{t['sinalizador']:02d}-{Path(t['membro']).name}"
    with open(tmp, 'wb') as f:
        f.write(dados)
    return tmp


def processar(t, tmp):
    """Roda no processo trabalhador: MediaPipe no vídeo, salva .npz, apaga o vídeo."""
    import extrair
    out = destino(t)
    try:
        out.parent.mkdir(parents=True, exist_ok=True)
        r = extrair.extrair_video(tmp, recortar=True, largura_max=640)
        sinal_id, palavra = config.SINAIS_MINDS[t['sinal']]
        parcial = out.with_name(out.stem + '.parcial.npz')
        np.savez_compressed(parcial, **r, sinal=sinal_id, palavra=palavra,
                            sinalizador=t['sinalizador'], rep=t['rep'], membro=t['membro'])
        os.replace(parcial, out)
    finally:
        Path(tmp).unlink(missing_ok=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sinalizadores', type=int, nargs='*', default=list(range(1, 13)))
    ap.add_argument('--conexoes', type=int, default=64)
    ap.add_argument('--processos', type=int, default=6)
    a = ap.parse_args()
    TMP.mkdir(parents=True, exist_ok=True)
    for f in TMP.glob('*'):
        f.unlink()

    tarefas = []
    cache = config.DADOS / 'minds-libras' / 'indice.json'
    indice = json.loads(cache.read_text(encoding='utf-8')) if cache.exists() else {}
    for s in a.sinalizadores:
        if str(s) not in indice:
            indice[str(s)] = listar(s)
            cache.write_text(json.dumps(indice, ensure_ascii=False), encoding='utf-8')
        ts = indice[str(s)]
        log(f'Sinalizador{s:02d}: {len(ts)} vídeos ({sum(t["comprimido"] for t in ts) / 1e9:.2f} GB)')
        tarefas += ts
    pendentes = [t for t in tarefas if not destino(t).exists()]
    total_gb = sum(t['comprimido'] for t in pendentes) / 1e9
    log(f'total {len(tarefas)} vídeos; {len(pendentes)} pendentes ({total_gb:.1f} GB)')

    ini, feitos, baixado = time.time(), 0, 0
    erros = []
    with ThreadPoolExecutor(a.conexoes) as rede, ProcessPoolExecutor(a.processos) as cpu:
        downloads = {rede.submit(baixar, t): t for t in pendentes}
        analises = {}
        for fut in as_completed(downloads):
            t = downloads[fut]
            try:
                tmp = fut.result()
                baixado += t['comprimido']
                analises[cpu.submit(processar, t, tmp)] = t
            except Exception:
                erros.append(t)
                log(f"ERRO download {t['membro']}: {traceback.format_exc(limit=1).strip().splitlines()[-1]}")
            # recolhe análises prontas sem bloquear
            for f2 in [f for f in analises if f.done()]:
                t2 = analises.pop(f2)
                try:
                    f2.result()
                    feitos += 1
                except Exception:
                    erros.append(t2)
                    log(f"ERRO análise {t2['membro']}: {traceback.format_exc(limit=1).strip().splitlines()[-1]}")
                if feitos % 10 == 0:
                    dt = time.time() - ini
                    taxa = baixado / dt / 1e6
                    resta = (total_gb * 1e3 - baixado / 1e6) / max(taxa, 1e-6) / 60
                    log(f'{feitos}/{len(pendentes)} vídeos prontos · {baixado / 1e9:.2f} GB · {taxa:.1f} MB/s · ~{resta:.0f} min restantes')
        for f2 in as_completed(list(analises)):
            t2 = analises[f2]
            try:
                f2.result()
                feitos += 1
            except Exception:
                erros.append(t2)
                log(f"ERRO análise {t2['membro']}: {traceback.format_exc(limit=1).strip().splitlines()[-1]}")

    with open(config.DADOS / 'minds-libras' / 'erros.json', 'w', encoding='utf-8') as f:
        json.dump([e['membro'] for e in erros], f, ensure_ascii=False, indent=1)
    log(f'fim: {feitos} prontos, {len(erros)} com erro (rode de novo para tentar outra vez)')
    sys.exit(1 if erros else 0)


if __name__ == '__main__':
    main()
