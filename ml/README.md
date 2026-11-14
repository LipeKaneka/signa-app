# Sinais dinâmicos (com movimento): coleta, treino e avaliação

O tradutor já reconhecia letras **estáticas** (k-NN sobre a forma da mão, em `frontend/src/features/translator/engine/classificador.js`).
Esta pasta adiciona o reconhecimento de **sinais com movimento**:

1. MediaPipe extrai mãos (até 2) e corpo, quadro a quadro.
2. Uma LSTM aprende a sequência.
3. O modelo só vai para o app depois de aprovado numa avaliação com pessoas que não participaram do treino.

O detector de letras continua igual. O modo novo é a aba **Palavras** do Tradutor.

## Resultado atual

Treinado em 14/11/2026 com `python ml/treinar.py --experimentais`: **170 palavras**.

- **20 avaliadas** (MINDS-Libras, 1158 gravações de 12 pessoas, mais 7 vídeos do INES):
  - validação cruzada por pessoa: 92,9% em média;
  - **teste em 2 pessoas nunca vistas: 87,0% de acerto**, F1 macro 0,878. Antes das palavras novas eram 94,0%. Das 200 gravações de teste, só 6 foram confundidas com uma palavra experimental; o resto da queda é o modelo maior (128 unidades) dividindo a atenção;
  - sinais mais fracos: Banco (40% de recall), Filho (50%), Cinco, Medo e Sapo (60%).
- **150 experimentais**: palavras do dicionário do app que só o Dicionário do INES tem (197 vídeos, uma pessoa). **Não têm medida de acerto**, porque não há gravações de outras pessoas. No app, só são aceitas com confiança ≥ 0,85 e aparecem como "experimental".

Para tirar o "experimental" de uma palavra: gravar várias pessoas com `gravar.py` e treinar de novo.

O relatório completo está em `relatorios/sinais-dinamicos.md`. Esses números valem para vídeos de estúdio; na câmera do celular, espere menos.

## Princípios

- **Só dados reais.** O modelo conhece apenas sinais gravados de verdade:
  - os 20 da [MINDS-Libras](https://doi.org/10.5281/zenodo.2667329) (CC BY 4.0, UFMG, 12 pessoas);
  - o [Dicionário da Libras do INES](https://dicionario.ines.gov.br/) (uso educacional): um vídeo por palavra, uma pessoa. Entra só no treino, como a pessoa `ines`, e só com a variante do sinal mais parecida com a das outras pessoas (as diferentes ficam de fora);
  - os que você gravar com `gravar.py`.

  Nada de sinais de outras línguas de sinais.
- **Avaliação por pessoa.**
  - Duas pessoas ficam só para o **teste**, usado uma vez, no fim.
  - As demais passam por validação cruzada agrupada por pessoa. Ninguém aparece em dois conjuntos.
- **Sem relatório aprovado, nada no app.**
  - `treinar.py` só grava `frontend/public/modelos/sinais-dinamicos.json` se o teste passar nos critérios (`APROVACAO` em `treinar.py`). Se não passar, apaga o modelo anterior.
  - O app recusa um modelo sem `aprovado: true`.
  - `demo_tempo_real.py` não roda com modelo reprovado.

## Como funciona

| Etapa | Arquivo | O que faz |
|---|---|---|
| Coleta MINDS | `baixar_minds.py` | Baixa cada vídeo de dentro do .zip remoto (HTTP Range; não baixa o .zip inteiro), extrai os pontos e apaga o vídeo. Respeita o limite de requisições do Zenodo e continua de onde parou. |
| Coleta INES | `baixar_ines.py` | Lê a lista de palavras do dicionário, baixa um vídeo por vez (pausa de 1 s), extrai os pontos e apaga o vídeo. Padrão: só as palavras que o modelo conhece; `--todos` baixa o dicionário inteiro (~5.800). |
| Alfabeto INES | `alfabeto_ines.py`, `alfabeto_ines.mjs` | Pontos da mão nos vídeos das letras do INES; depois o próprio código do app (via esbuild) gera amostras de letras paradas e os gestos de K e Z, com limiar abaixo de todos os movimentos de "não-letra". Mostra o efeito nas fotos de celular da benchmarking-libras (52,3% → 65,1%). |
| Pontos | `extrair.py` | MediaPipe Tasks 1.1.1 (a mesma versão do app): `hand_landmarker` (2 mãos) e `pose_landmarker_lite`. Guarda os pontos brutos (`.npz`). |
| Características | `caracteristicas.py` | 154 por quadro (detalhes abaixo). |
| Recorte | `caracteristicas.py` | O sinal vai de repouso a repouso: começa quando uma mão aparece e termina quando as mãos somem. Depois o trecho é reamostrado para 24 quadros. |
| Treino e avaliação | `treinar.py` | Dense(64, ReLU) por quadro → LSTM(64) → softmax. Aumento de dados: espelho (canhotos), rotação/escala, velocidade, cortes e falhas de detecção. |
| App | `frontend/src/features/translator/engine/dinamicos.js`, `src/pages/Palavras.jsx` | As mesmas contas em JavaScript, sem TensorFlow.js: os pesos vão num JSON de ~200 KB e rodam no celular, dentro do APK, sem servidor. |
| Paridade | `testar_paridade.py` | Confere que o JavaScript dá o mesmo resultado que o Python (características, recorte e probabilidades). |
| Gravar sinais | `gravar.py` | Webcam + OpenCV. Salva só os pontos, por pessoa e sinal. |
| Demo | `demo_tempo_real.py` | Janela do OpenCV com reconhecimento ao vivo. |

**As 154 características por quadro:**
- **Corpo (22):** nariz, olhos, boca, ombros, cotovelos e punhos, relativos ao centro dos ombros e divididos pela largura dos ombros.
- **Cada mão (66):**
  - presença;
  - posição do punho em relação ao corpo;
  - formato: os 21 pontos x/y/z relativos ao punho, divididos pelo tamanho da palma.

## Passo a passo

```bash
# 1) Ambiente (Python 3.12; no Windows, o uv instala sem mexer no Python do sistema)
uv venv D:\signa-dados\venv --python 3.12
uv pip install --python D:\signa-dados\venv\Scripts\python.exe -r ml/requirements.txt
# modelos do MediaPipe em D:\signa-dados\modelos-mediapipe (hand_landmarker.task, pose_landmarker_lite.task)

# 2) Coleta da MINDS-Libras (64,8 GB baixados aos poucos; só os pontos ficam, ~100 MB)
python ml/baixar_minds.py

# 3) Treino + relatório (ml/relatorios/sinais-dinamicos.md) + exportação se aprovado
python ml/baixar_ines.py --app   # opcional: pontos do Dicionário do INES para as palavras do app
python ml/treinar.py --experimentais   # sem a opção: só as 20 palavras avaliadas

# 4) Conferir o app contra o Python
python ml/testar_paridade.py

# 5) Opcional: gravar sinais próprios (várias pessoas!) e treinar de novo
python ml/gravar.py --pessoa p01 --sinal obrigado --palavra Obrigado --vezes 10
python ml/treinar.py
```

Os dados pesados ficam fora do repositório, em `SIGNA_DADOS` (padrão `D:\signa-dados`).

## Limitações

- **Vocabulário fechado:** só reconhece os sinais treinados. Outros gestos podem ser confundidos com eles. O limiar de confiança (calibrado na validação) reduz isso, mas não elimina. Não há exemplos de "outros gestos" para treinar uma classe de rejeição.
- **Diferença de condições:** a MINDS foi gravada em estúdio (fundo verde, câmera fixa, pessoa da cintura para cima). Na câmera do celular a acurácia deve ser menor que a do relatório. A forma de melhorar é gravar exemplos reais nessas condições, com várias pessoas.
- **Mãos fora da imagem:** é preciso começar e terminar com as mãos abaixadas, fora da imagem.
- **Expressões faciais:** ainda não são usadas.
- **Modelos do MediaPipe:** já vão dentro do app (`frontend/public/mediapipe/modelos/`), então o APK funciona offline.

## Desempenho no celular

- **Thread separada:** a detecção roda num Web Worker (`frontend/src/features/translator/engine/visao.worker.js`), então a tela não trava.
- **CPU ou GPU:** na primeira vez, o app mede as duas no próprio aparelho (cerca de 1 a 5 s) e guarda a mais rápida.
- **Menos trabalho por quadro:**
  - o corpo é detectado a cada 3 quadros;
  - a segunda mão só é procurada quando os dois braços estão erguidos;
  - no celular, a câmera usa 480×360.
- **Medição no PC (navegador, CPU):** o tradutor completo leva cerca de 48 ms por quadro. Antes das otimizações eram cerca de 106 ms. A versão antiga, só de letras, leva cerca de 42 ms.
- **No aparelho:** o tempo real aparece em "Mostrar diagnóstico" no Tradutor (ms por quadro, CPU/GPU e quadros por segundo).

Fonte dos dados: MINDS-Libras Dataset — Sílvia G. M. Almeida, Tamires M. Rezende, Gabriela T. B. Almeida, Andreia C. R. Toffolo e Frederico G. Guimarães (UFMG). DOI 10.5281/zenodo.2667329. Licença CC BY 4.0.
