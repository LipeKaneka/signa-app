"""Caminhos e metadados compartilhados pelo pipeline de sinais dinâmicos."""
import json
import os
import re
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
# Dados pesados ficam fora do repositório (padrão: SSD D:). Mude com SIGNA_DADOS.
DADOS = Path(os.environ.get('SIGNA_DADOS', r'D:\signa-dados'))
MODELOS_MP = DADOS / 'modelos-mediapipe'
MAO_TASK = MODELOS_MP / 'hand_landmarker.task'
POSE_TASK = MODELOS_MP / 'pose_landmarker_lite.task'

MINDS_URL = 'https://zenodo.org/records/2667329/files/Sinalizador{:02d}.zip?download=1'
MINDS_PONTOS = DADOS / 'minds-libras' / 'pontos'
PROPRIOS_PONTOS = DADOS / 'gravacoes' / 'pontos'

# Dicionário da Libras do INES (uso educacional): um vídeo por sinal, 240x176, 12 quadros/s.
INES_SITE = 'https://dicionario.ines.gov.br'
INES_PALAVRAS = INES_SITE + '/public/site/js/palavras.js'
INES_VIDEO = INES_SITE + '/public/media/palavras/videos/{}'
INES_PONTOS = DADOS / 'ines' / 'pontos'
# Palavras do dicionário do app (seed do servidor): o vocabulário que o modelo tenta aprender do INES.
PALAVRAS_APP = RAIZ.parent / 'server' / 'src' / 'seeds' / 'data' / 'signs.json'
SAIDA = DADOS / 'treino'

# Os 20 sinais da MINDS-Libras (ordem e numeração dos arquivos: 01Acontecer ... 20Vontade).
SINAIS_MINDS = [
    ('acontecer', 'Acontecer'), ('aluno', 'Aluno'), ('amarelo', 'Amarelo'), ('america', 'América'),
    ('aproveitar', 'Aproveitar'), ('bala', 'Bala'), ('banco', 'Banco'), ('banheiro', 'Banheiro'),
    ('barulho', 'Barulho'), ('cinco', 'Cinco'), ('conhecer', 'Conhecer'), ('espelho', 'Espelho'),
    ('esquina', 'Esquina'), ('filho', 'Filho'), ('maca', 'Maçã'), ('medo', 'Medo'),
    ('ruim', 'Ruim'), ('sapo', 'Sapo'), ('vacina', 'Vacina'), ('vontade', 'Vontade'),
]

FONTE_MINDS = ('MINDS-Libras Dataset — Sílvia G. M. Almeida, Tamires M. Rezende, Gabriela T. B. Almeida, '
               'Andreia C. R. Toffolo e Frederico G. Guimarães (UFMG). DOI 10.5281/zenodo.2667329. Licença CC BY 4.0.')
FONTE_INES = ('Dicionário da Língua Brasileira de Sinais — INES / Acessibilidade Brasil (T. A. Felipe e G. A. Lira), '
              'https://dicionario.ines.gov.br/. Usado em trabalho escolar, com fins educacionais.')

# Sinais que vêm só do INES (uma pessoa, sem teste com pessoas nunca vistas): entram no app como
# "experimentais" e só são aceitos com confiança alta.
LIMIAR_EXPERIMENTAL = 0.85


def slug(texto):
    sem_acento = ''.join(c for c in unicodedata.normalize('NFD', texto.lower()) if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', '-', sem_acento).strip('-')


def palavras_app():
    """{sinal: palavra} do dicionário do app, sem o alfabeto (as letras são do detector de letras)."""
    sinais = json.loads(PALAVRAS_APP.read_text(encoding='utf-8'))
    return {slug(s['word']): s['word'] for s in sinais if s['category'] != 'Alfabeto'}


# Mesmas confianças do detector de letras do app (frontend/src/features/translator/engine/maos.js).
OPCOES_MAO = dict(num_hands=2, min_hand_detection_confidence=0.6, min_hand_presence_confidence=0.6,
                  min_tracking_confidence=0.5)
OPCOES_POSE = dict(num_poses=1, min_pose_detection_confidence=0.5, min_pose_presence_confidence=0.5,
                   min_tracking_confidence=0.5)
