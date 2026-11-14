"""Leitura de um .zip hospedado (Zenodo) por requisições HTTP com Range.

Permite listar o conteúdo sem baixar o arquivo inteiro e baixar só um membro, retomando
de onde parou se a conexão cair. Respeita o limite de requisições do Zenodo
(~60/min por IP): todas as threads passam por um limitador comum e, ao receber 429,
todas esperam o tempo pedido pelo servidor.
"""
import io
import threading
import time
import urllib.error
import urllib.request

REQ_POR_MINUTO = 30


class Limitador:
    def __init__(self, por_minuto):
        self.intervalo = 60.0 / por_minuto
        self.prox = 0.0
        self.pausa_ate = 0.0
        self.trava = threading.Lock()

    def esperar(self):
        with self.trava:
            agora = time.monotonic()
            inicio = max(agora, self.prox, self.pausa_ate)
            self.prox = inicio + self.intervalo
        time.sleep(max(0.0, inicio - time.monotonic()))

    def pausar(self, segundos):
        with self.trava:
            self.pausa_ate = max(self.pausa_ate, time.monotonic() + segundos)


LIMITE = Limitador(REQ_POR_MINUTO)


def _abrir(url, ini, fim):
    LIMITE.esperar()
    req = urllib.request.Request(url, headers={'Range': f'bytes={ini}-{fim}', 'User-Agent': 'signa-app-pesquisa/1.0'})
    try:
        r = urllib.request.urlopen(req, timeout=120)
    except urllib.error.HTTPError as e:
        if e.code == 429:
            espera = int(e.headers.get('Retry-After') or 60)
            LIMITE.pausar(espera)
        raise
    if r.status != 206:  # servidor ignorou o Range: não baixar o arquivo inteiro
        r.close()
        raise RuntimeError(f'resposta {r.status} sem Range')
    return r


def baixar_faixa(url, ini, fim, tentativas=12):
    """Bytes [ini, fim] (inclusive). Se a conexão cair no meio, continua do ponto em que parou."""
    partes, pos, falhas = [], ini, 0
    while pos <= fim:
        try:
            with _abrir(url, pos, fim) as r:
                while True:
                    b = r.read(1 << 20)
                    if not b:
                        break
                    partes.append(b)
                    pos += len(b)
            if pos <= fim:
                raise IOError('conexão encerrada antes do fim')
        except Exception:
            falhas += 1
            if falhas >= tentativas:
                raise
            time.sleep(min(60, 2 ** falhas))
    return b''.join(partes)


class ArquivoRemoto(io.RawIOBase):
    """Arquivo somente-leitura e "seekable" sobre HTTP Range (bom para zipfile)."""

    def __init__(self, url, tamanho=None):
        self.url = url
        self.pos = 0
        self.tamanho = tamanho if tamanho is not None else self._descobrir_tamanho()

    def _descobrir_tamanho(self):
        with _abrir(self.url, 0, 0) as r:
            return int(r.headers['Content-Range'].split('/')[-1])

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, off, whence=io.SEEK_SET):
        base = {io.SEEK_SET: 0, io.SEEK_CUR: self.pos, io.SEEK_END: self.tamanho}[whence]
        self.pos = max(0, base + off)
        return self.pos

    def read(self, n=-1):
        if self.pos >= self.tamanho:
            return b''
        # leituras pequenas do zipfile viram blocos maiores (menos requisições)
        fim = self.tamanho - 1 if n is None or n < 0 else min(self.tamanho - 1, self.pos + max(n, 1 << 16) - 1)
        dados = baixar_faixa(self.url, self.pos, fim)
        if n is not None and n >= 0:
            dados = dados[:n]
        self.pos += len(dados)
        return dados

    def readinto(self, b):
        dados = self.read(len(b))
        b[:len(dados)] = dados
        return len(dados)
