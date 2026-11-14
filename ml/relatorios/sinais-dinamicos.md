# Relatório — sinais dinâmicos (LSTM)

Gerado em 2026-11-14 01:21 por `ml/treinar.py` (semente 42).

**Resultado: APROVADO para uso no app**

## Protocolo

- Dados: MINDS-Libras (CC BY 4.0, UFMG), Dicionário da Libras do INES (uma pessoa, só no treino, uma variante por sinal) e gravações próprias, quando houver. Só sinais gravados de verdade.
- Divisão **por pessoa**: ninguém aparece em mais de um conjunto.
- Teste (usado uma vez, no fim): minds-01, minds-10.
- Treino/validação: ines, minds-02, minds-03, minds-04, minds-05, minds-06, minds-07, minds-08, minds-09, minds-11, minds-12 — validação cruzada agrupada por pessoa (5 dobras).
- Modelo final treinado com 32 épocas (mediana das dobras).

## Resultados

| Conjunto | Acurácia | F1 macro |
|---|---|---|
| Validação cruzada (média ± desvio) | 94.7% ± 3.1% | 0.946 |
| **Teste (pessoas nunca vistas)** | **94.0%** | **0.941** |

Limiar de confiança (escolhido na validação, não no teste): **0.46**. No teste, 100% das gravações ficam acima dele, com 94.5% de acerto entre elas.

### Critérios de aprovação (no teste)

- acuracia ≥ 0.8: ok
- f1_macro ≥ 0.75: ok
- recall_min_por_sinal ≥ 0.4: ok

### Por dobra

| Dobra | Pessoas de validação | Acurácia | F1 | Épocas |
|---|---|---|---|---|
| 1 | ines, minds-07, minds-09 | 96.2% | 0.959 | 32 |
| 2 | minds-05, minds-12 | 91.5% | 0.911 | 6 |
| 3 | minds-02, minds-11 | 100.0% | 1.000 | 50 |
| 4 | minds-04, minds-08 | 93.8% | 0.938 | 32 |
| 5 | minds-03, minds-06 | 91.9% | 0.922 | 17 |

### Por pessoa de teste

- minds-01: 99.0%
- minds-10: 89.0%

### Por sinal (teste)

| Sinal | Precisão | Recall | F1 | n |
|---|---|---|---|---|
| Acontecer | 1.00 | 0.90 | 0.95 | 10 |
| Aluno | 1.00 | 1.00 | 1.00 | 10 |
| Amarelo | 1.00 | 1.00 | 1.00 | 10 |
| América | 1.00 | 1.00 | 1.00 | 10 |
| Aproveitar | 1.00 | 1.00 | 1.00 | 10 |
| Bala | 1.00 | 1.00 | 1.00 | 10 |
| Banco | 1.00 | 1.00 | 1.00 | 10 |
| Banheiro | 1.00 | 0.90 | 0.95 | 10 |
| Barulho | 1.00 | 1.00 | 1.00 | 10 |
| Cinco | 0.91 | 1.00 | 0.95 | 10 |
| Conhecer | 1.00 | 1.00 | 1.00 | 10 |
| Espelho | 1.00 | 1.00 | 1.00 | 10 |
| Esquina | 1.00 | 0.90 | 0.95 | 10 |
| Filho | 0.71 | 0.50 | 0.59 | 10 |
| Maçã | 1.00 | 1.00 | 1.00 | 10 |
| Medo | 0.50 | 0.70 | 0.58 | 10 |
| Ruim | 1.00 | 0.90 | 0.95 | 10 |
| Sapo | 0.91 | 1.00 | 0.95 | 10 |
| Vacina | 1.00 | 1.00 | 1.00 | 10 |
| Vontade | 0.91 | 1.00 | 0.95 | 10 |

### Limiar × cobertura

| Limiar | Cobertura (val) | Acerto aceitos (val) | Cobertura (teste) | Acerto aceitos (teste) |
|---|---|---|---|---|
| 0.00 | 100% | 94.7% | 100% | 94.0% |
| 0.30 | 100% | 94.7% | 100% | 94.0% |
| 0.40 | 100% | 94.8% | 100% | 94.5% |
| 0.50 | 98% | 95.6% | 100% | 94.5% |
| 0.60 | 97% | 96.3% | 99% | 94.9% |
| 0.70 | 95% | 97.2% | 96% | 95.3% |
| 0.80 | 92% | 97.9% | 96% | 95.8% |
| 0.90 | 89% | 98.6% | 94% | 96.8% |
| 0.95 | 86% | 98.9% | 93% | 96.8% |

### Matriz de confusão (teste; linhas = real, colunas = previsto)

| | Acon | Alun | Amar | Amér | Apro | Bala | Banc | Banh | Baru | Cinc | Conh | Espe | Esqu | Filh | Maçã | Medo | Ruim | Sapo | Vaci | Vont |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Acontecer | 9 | · | · | · | · | · | · | · | · | · | · | · | · | · | · | 1 | · | · | · | · |
| Aluno | · | 10 | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| Amarelo | · | · | 10 | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| América | · | · | · | 10 | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| Aproveitar | · | · | · | · | 10 | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| Bala | · | · | · | · | · | 10 | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| Banco | · | · | · | · | · | · | 10 | · | · | · | · | · | · | · | · | · | · | · | · | · |
| Banheiro | · | · | · | · | · | · | · | 9 | · | 1 | · | · | · | · | · | · | · | · | · | · |
| Barulho | · | · | · | · | · | · | · | · | 10 | · | · | · | · | · | · | · | · | · | · | · |
| Cinco | · | · | · | · | · | · | · | · | · | 10 | · | · | · | · | · | · | · | · | · | · |
| Conhecer | · | · | · | · | · | · | · | · | · | · | 10 | · | · | · | · | · | · | · | · | · |
| Espelho | · | · | · | · | · | · | · | · | · | · | · | 10 | · | · | · | · | · | · | · | · |
| Esquina | · | · | · | · | · | · | · | · | · | · | · | · | 9 | · | · | · | · | 1 | · | · |
| Filho | · | · | · | · | · | · | · | · | · | · | · | · | · | 5 | · | 5 | · | · | · | · |
| Maçã | · | · | · | · | · | · | · | · | · | · | · | · | · | · | 10 | · | · | · | · | · |
| Medo | · | · | · | · | · | · | · | · | · | · | · | · | · | 2 | · | 7 | · | · | · | 1 |
| Ruim | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | 1 | 9 | · | · | · |
| Sapo | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | 10 | · | · |
| Vacina | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | 10 | · |
| Vontade | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | 10 |

## Dados

1165 gravações usadas; 0 descartadas (nenhuma mão detectada).

| Pessoa | Gravações |
|---|---|
| ines | 7 |
| minds-01 | 100 |
| minds-02 | 100 |
| minds-03 | 85 |
| minds-04 | 95 |
| minds-05 | 100 |
| minds-06 | 100 |
| minds-07 | 103 |
| minds-08 | 100 |
| minds-09 | 75 |
| minds-10 | 100 |
| minds-11 | 100 |
| minds-12 | 100 |

## Limitações (leia antes de usar)

- O modelo só conhece estes sinais. Qualquer outro gesto pode ser confundido com um deles; o limiar reduz, mas não elimina, isso (não há exemplos de "outros gestos" no treino).
- Gravações da MINDS: fundo verde, câmera fixa, iluminação de estúdio, pessoa de corpo inteiro até a cintura. Na câmera do celular a acurácia tende a ser menor; grave exemplos próprios (`ml/gravar.py`) e retreine.
- O sinal precisa começar e terminar com as mãos abaixadas (fora da imagem), como nas gravações.
- Expressões faciais não são usadas.

Fontes: MINDS-Libras Dataset — Sílvia G. M. Almeida, Tamires M. Rezende, Gabriela T. B. Almeida, Andreia C. R. Toffolo e Frederico G. Guimarães (UFMG). DOI 10.5281/zenodo.2667329. Licença CC BY 4.0. Dicionário da Língua Brasileira de Sinais — INES / Acessibilidade Brasil (https://dicionario.ines.gov.br/), uso educacional.
