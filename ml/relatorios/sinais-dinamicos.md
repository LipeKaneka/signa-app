# Relatório — sinais dinâmicos (LSTM)

Gerado em 2026-11-14 02:17 por `ml/treinar.py` (semente 42).

**Resultado: APROVADO para uso no app**

## Protocolo

- Dados: MINDS-Libras (CC BY 4.0, UFMG), Dicionário da Libras do INES (uma pessoa, só no treino, uma variante por sinal) e gravações próprias, quando houver. Só sinais gravados de verdade.
- Divisão **por pessoa**: ninguém aparece em mais de um conjunto.
- Teste (usado uma vez, no fim): minds-01, minds-10.
- Treino/validação: ines, minds-02, minds-03, minds-04, minds-05, minds-06, minds-07, minds-08, minds-09, minds-11, minds-12 — validação cruzada agrupada por pessoa (5 dobras).
- Modelo final treinado com 14 épocas (mediana das dobras).

## Resultados

| Conjunto | Acurácia | F1 macro |
|---|---|---|
| Validação cruzada (média ± desvio) | 92.9% ± 3.1% | 0.938 |
| **Teste (pessoas nunca vistas)** | **87.0%** | **0.878** |

Limiar de confiança (escolhido na validação, não no teste): **0.46**. No teste, 98% das gravações ficam acima dele, com 88.3% de acerto entre elas.

### Critérios de aprovação (no teste)

- acuracia ≥ 0.8: ok
- f1_macro ≥ 0.75: ok
- recall_min_por_sinal ≥ 0.4: ok

### Por dobra

| Dobra | Pessoas de validação | Acurácia | F1 | Épocas |
|---|---|---|---|---|
| 1 | ines, minds-07, minds-09 | 91.4% | 0.928 | 14 |
| 2 | minds-05, minds-12 | 94.5% | 0.952 | 20 |
| 3 | minds-02, minds-11 | 98.0% | 0.982 | 31 |
| 4 | minds-04, minds-08 | 91.3% | 0.927 | 7 |
| 5 | minds-03, minds-06 | 89.2% | 0.902 | 14 |

### Por pessoa de teste

- minds-01: 95.0%
- minds-10: 79.0%

### Por sinal (teste)

| Sinal | Precisão | Recall | F1 | n |
|---|---|---|---|---|
| Acontecer | 1.00 | 1.00 | 1.00 | 10 |
| Aluno | 1.00 | 1.00 | 1.00 | 10 |
| Amarelo | 0.91 | 1.00 | 0.95 | 10 |
| América | 1.00 | 1.00 | 1.00 | 10 |
| Aproveitar | 1.00 | 1.00 | 1.00 | 10 |
| Bala | 1.00 | 0.90 | 0.95 | 10 |
| Banco | 1.00 | 0.40 | 0.57 | 10 |
| Banheiro | 1.00 | 0.90 | 0.95 | 10 |
| Barulho | 1.00 | 1.00 | 1.00 | 10 |
| Cinco | 1.00 | 0.60 | 0.75 | 10 |
| Conhecer | 1.00 | 1.00 | 1.00 | 10 |
| Espelho | 1.00 | 1.00 | 1.00 | 10 |
| Esquina | 0.71 | 1.00 | 0.83 | 10 |
| Filho | 0.62 | 0.50 | 0.56 | 10 |
| Maçã | 1.00 | 1.00 | 1.00 | 10 |
| Medo | 0.46 | 0.60 | 0.52 | 10 |
| Ruim | 0.69 | 0.90 | 0.78 | 10 |
| Sapo | 1.00 | 0.60 | 0.75 | 10 |
| Vacina | 1.00 | 1.00 | 1.00 | 10 |
| Vontade | 0.91 | 1.00 | 0.95 | 10 |

### Limiar × cobertura

| Limiar | Cobertura (val) | Acerto aceitos (val) | Cobertura (teste) | Acerto aceitos (teste) |
|---|---|---|---|---|
| 0.00 | 100% | 93.0% | 100% | 87.0% |
| 0.30 | 99% | 93.3% | 100% | 87.0% |
| 0.40 | 98% | 94.3% | 100% | 86.9% |
| 0.50 | 96% | 95.4% | 98% | 88.3% |
| 0.60 | 94% | 96.2% | 96% | 89.6% |
| 0.70 | 91% | 97.6% | 94% | 90.5% |
| 0.80 | 88% | 98.3% | 92% | 91.4% |
| 0.90 | 83% | 99.1% | 92% | 91.8% |
| 0.95 | 79% | 99.3% | 84% | 94.0% |

### Matriz de confusão (teste; linhas = real, colunas = previsto)

| | Acon | Alun | Amar | Amér | Apro | Bala | Banc | Banh | Baru | Cinc | Conh | Espe | Esqu | Filh | Maçã | Medo | Ruim | Sapo | Vaci | Vont |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Acontecer | 10 | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| Aluno | · | 10 | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| Amarelo | · | · | 10 | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| América | · | · | · | 10 | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| Aproveitar | · | · | · | · | 10 | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| Bala | · | · | · | · | · | 9 | · | · | · | · | · | · | · | · | · | 1 | · | · | · | · |
| Banco | · | · | 1 | · | · | · | 4 | · | · | · | · | · | · | · | · | 1 | 4 | · | · | · |
| Banheiro | · | · | · | · | · | · | · | 9 | · | · | · | · | · | · | · | · | · | · | · | · |
| Barulho | · | · | · | · | · | · | · | · | 10 | · | · | · | · | · | · | · | · | · | · | · |
| Cinco | · | · | · | · | · | · | · | · | · | 6 | · | · | · | · | · | · | · | · | · | · |
| Conhecer | · | · | · | · | · | · | · | · | · | · | 10 | · | · | · | · | · | · | · | · | · |
| Espelho | · | · | · | · | · | · | · | · | · | · | · | 10 | · | · | · | · | · | · | · | · |
| Esquina | · | · | · | · | · | · | · | · | · | · | · | · | 10 | · | · | · | · | · | · | · |
| Filho | · | · | · | · | · | · | · | · | · | · | · | · | · | 5 | · | 5 | · | · | · | · |
| Maçã | · | · | · | · | · | · | · | · | · | · | · | · | · | · | 10 | · | · | · | · | · |
| Medo | · | · | · | · | · | · | · | · | · | · | · | · | · | 3 | · | 6 | · | · | · | 1 |
| Ruim | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | 9 | · | · | · |
| Sapo | · | · | · | · | · | · | · | · | · | · | · | · | 4 | · | · | · | · | 6 | · | · |
| Vacina | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | 10 | · |
| Vontade | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | · | 10 |

## Sinais experimentais (150)

Vêm só do Dicionário do INES (uma pessoa; 197 vídeos). Ficaram no treino e NÃO têm medida de acerto: não existem gravações de outras pessoas para testar. No app, só são aceitos com confiança alta e aparecem como experimentais.
No teste, 6 das gravações dos sinais avaliados foram confundidas com algum sinal experimental (já contadas como erro acima).

Abelha, Abrir, Água, Ajudar, Amanhã, Amigo, Amor, Aprender, Arroz, Azul, Banana, Bebê, Beber, Bem-vindo, Borboleta, Borracha, Branco, Brigar, Brincar, Cachorro, Caderno, Café, Calmo, Caneta, Cansado, Carne, Carro, Casa, Cavalo, Certo, Cinza, Cobra, Coelho, Cola, Colega, Com licença, Comer, Como, Computador, Conversar, Desenhar, Dez, Diretor, Dois, Domingo, Dupla, Dúvida, Elefante, Ensinar, Entender, Errado, Escola, Escrever, Esperar, Estudar, Explicar, Família, Feijão, Feliz, Galinha, Gato, Geografia, Girafa, História, Hoje, Intérprete, Irmão, Lápis, Laranja, Leão, Leite, Ler, Levantar, Livro, Macaco, Marrom, Matemática, Mês, Mochila, Nervoso, Nome, Nove, Obrigado, Oi, Oito, Olá, Olhar, Onde, Ônibus, Ontem, Ouvinte, Ovo, Página, Pai, Pão, Parabéns, Pássaro, Pato, Peixe, Por favor, Porco, Português, Prazer, Preto, Primeiro, Primo, Professor, Prova, Qual, Quando, Quarta-feira, Quarto, Quatro, Quem, Quinta-feira, Quinto, Raiva, Regra, Repetir, Respeito, Responder, Rosa, Roxo, Sábado, Sala, Segunda-feira, Segundo, Seis, Semana, Sentar, Sete, Sexta-feira, Silêncio, Surdo, Tartaruga, Tchau, Tentar, Terceiro, Terminar, Tesoura, Trabalhar, Três, Tudo bem, Turma, Último, Um, Vaca, Verde, Vermelho, Zero

## Dados

1362 gravações usadas; 0 descartadas (nenhuma mão detectada).

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

Fontes: MINDS-Libras Dataset — Sílvia G. M. Almeida, Tamires M. Rezende, Gabriela T. B. Almeida, Andreia C. R. Toffolo e Frederico G. Guimarães (UFMG). DOI 10.5281/zenodo.2667329. Licença CC BY 4.0. Dicionário da Língua Brasileira de Sinais — INES / Acessibilidade Brasil (T. A. Felipe e G. A. Lira), https://dicionario.ines.gov.br/. Usado em trabalho escolar, com fins educacionais.
