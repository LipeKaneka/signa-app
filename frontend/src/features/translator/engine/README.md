# Motor do tradutor (engine)

Código de reconhecimento trazido do projeto anterior **sem mudanças de lógica** (já validado; nomes internos em
português). As telas não usam estes arquivos direto: passam por `../useHandCamera.js` e `../useSignTranslator.js`.
Tudo roda no aparelho; nenhuma imagem é enviada.

| Arquivo | O que faz | Principais funções |
|---|---|---|
| `maos.js` | Configura o MediaPipe (mãos e corpo) e escolhe a mão principal | `maoPrincipal`, `detector`, `detectorCorpo`, `CONEXOES` |
| `detectorRemoto.js` | Roda o MediaPipe num Web Worker e escolhe CPU ou GPU na primeira vez | `criarDetector` |
| `visao.worker.js` | O worker em si (recebe quadros, devolve pontos) | — |
| `classificador.js` | Letras paradas: normaliza os 21 pontos, extrai características e classifica por k-NN; guarda as amostras da pessoa | `pontosNormalizados`, `caracteristicas`, `classificar`, `todasAmostras`, `adicionarAmostras`, `exportarProprias`, `importarProprias` |
| `amostras-base.json` | 1781 amostras de referência de 21 letras (inclui 159 do Dicionário do INES, geradas por `ml/alfabeto_ines.mjs`) | — |
| `gestos-base.json` | K e Z de referência (Dicionário do INES), com limiar calibrado; valem até a pessoa ensinar a letra | — |
| `escrita.js` | Transforma a sequência de classificações em texto (estabilidade, repetição) | `estadoInicial`, `processar`, `acrescentar` |
| `perfil.js` | Perfil da mão (proporções dos dedos), filtros de detecção falsa e medida de movimento | `lerPerfil`, `salvarPerfil`, `analisarProporcoes`, `motivoImplausivel`, `movimento` |
| `movimento.js` | Letras com movimento (H, J, K, X, Z, Ç) por DTW: K e Z vêm com o app; as outras (e quem quiser trocar K/Z) são ensinadas pela pessoa | `DetectorGesto`, `adicionarGesto`, `classificarGesto`, `prepararGestos` |
| `dinamicos.js` | Palavras com movimento (modelo LSTM treinado com MINDS-Libras) | `carregarModelo`, `Extrator`, `Segmentador`, `classificarSinal` |

Dados salvos no aparelho (localStorage): amostras próprias, letras com movimento ensinadas, perfil da mão e a
escolha CPU/GPU. Créditos e licenças: veja a gaveta da câmera no app e o README do frontend.
