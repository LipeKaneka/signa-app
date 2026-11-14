# Histórico de versões do Signa (APK)

Cada versão tem uma **tag** no git (`v1.0.0`, `v1.0.1`...) apontando para o código exato daquela entrega, e o APK
correspondente fica nesta pasta como `Signa-<versão>.apk` (os APKs não vão para o git: são grandes demais; para
recriar qualquer um, faça checkout da tag e gere o APK, ou rode `npm run release` para versões novas).

## Versões

| Versão | Data | versionCode | Tag | O que mudou |
|---|---|---|---|---|
| **1.6.6** | 14/11/2026 | 14 | `v1.6.6` | Alfabeto: K e Z sem precisar ensinar e letras paradas mais precisas (Dicionário do INES) |
| **1.6.5** | 14/11/2026 | 13 | `v1.6.5` | Notificação no celular volta a funcionar (aparelho registrado sempre que o app abre) |
| **1.6.4** | 14/11/2026 | 12 | `v1.6.4` | Tradutor reconhece 150 palavras novas do Dicionário do INES (experimentais), 170 no total |
| **1.6.3** | 14/11/2026 | 11 | `v1.6.3` | Notificações sem o ícone redondo com emoji |
| **1.6.2** | 14/11/2026 | 10 | `v1.6.2` | Notificações legíveis e aviso no celular também com o app aberto |
| **1.6.1** | 14/11/2026 | 9 | `v1.6.1` | Corrige o login com o Google no celular |
| **1.6.0** | 14/11/2026 | 8 | `v1.6.0` | Notificações: sino, tela Notificações, aviso em tempo real e notificação no celular |
| **1.5.0** | 12/11/2026 | 7 | `v1.5.0` | Conquistas personalizáveis: imagens, emojis, cores, efeitos e raridades criadas no painel |
| **1.4.0** | 11/11/2026 | 5 | `v1.4.0` | Login com Google; conquistas por toques, dicionário e uso do app; release pelo GitHub |
| **1.3.0** | 11/11/2026 | 4 | `v1.3.0` | Trilha decorada; aviso de atualização a cada abertura; link do Google Drive baixa direto |
| **1.2.0** | 11/11/2026 | 3 | `v1.2.0` | Tema escolhido aparece marcado nas configurações |
| **1.1.0** | 11/11/2026 | 2 | `v1.1.0` (c40dac9) | Aviso de APK novo: tela de atualização configurada pelo painel (versão 1.1) |
| **1.0.16** | 11/11/2026 | 1 | `v1.0.16` (5238f7c) | App: dados guardados no aparelho para abrir telas sem esperar o servidor |
| **1.0.15** | 10/11/2026 | 1 | `v1.0.15` (76b6d00) | App: abre mais rápido e faz menos requisições |
| **1.0.14** | 10/11/2026 | 1 | `v1.0.14` (196d11e) | Trilha para professores do Fundamental 1: 5 módulos, teoria e 81 sinais novos |
| **1.0.13** | 10/11/2026 | 1 | `v1.0.13` (5096908) | App: animação de abertura no resultado de cada atividade |
| **1.0.12** | 09/11/2026 | 1 | `v1.0.12` (cd31815) | Conquistas na hora durante a atividade, conquistas secretas e botão voltar do Android |
| **1.0.11** | 09/11/2026 | 1 | `v1.0.11` (b353a48) | Painel: números grandes com K, M, B, T, Qd, Qn... (app com os mesmos sufixos) |
| **1.0.10** | 09/11/2026 | 1 | `v1.0.10` (b3caffc) | App: chama e barras de XP com a arte nova (signa elementos) |
| **1.0.9** | 06/11/2026 | 1 | `v1.0.9` (923c260) | App Android: nome Signa, ícone com a logo colorida e abertura com a logo |
| **1.0.8** | 05/11/2026 | 1 | `v1.0.8` (a2ea888) | Trilha: "Módulo completado!" no fim do módulo e caminho termina na última unidade |
| **1.0.7** | 05/11/2026 | 1 | `v1.0.7` (2cb2144) | Números grandes no app com K, M, B, T, Q (1,5K, 2,3M...) |
| **1.0.6** | 05/11/2026 | 1 | `v1.0.6` (5d634d9) | Login com Google e recuperação de senha pela API do Mailtrap |
| **1.0.5** | 05/11/2026 | 1 | `v1.0.5` (056bf4a) | Banimento com motivo e prazo; faixa de evento atualiza sem reabrir o app |
| **1.0.4** | 05/11/2026 | 1 | `v1.0.4` (0977668) | Eventos com aparência personalizável, sem teto de XP; ranking sem duplicar |
| **1.0.3** | 04/11/2026 | 1 | `v1.0.3` (f6708bc) | Atividades com câmera: pergunta "Faça o sinal" (camera_sign) |
| **1.0.2** | 03/11/2026 | 1 | `v1.0.2` (6c8b4d8) | Servidor dormindo no Render e histórico do assistente fora de ordem |
| **1.0.1** | 03/11/2026 | 1 | `v1.0.1` (6d3b8ae) | Interface: cabeçalhos fixos, assistente reorganizado e margens |
| **1.0.0** | 02/11/2026 | 1 | `v1.0.0` (97cc94c) | v1.0 |

## Observações

- **1.0.0 a 1.0.16** foram entregues antes do controle de versões: todas saíram com `versionCode 1` (o Android as
  enxerga como a mesma versão). A partir da **1.1.0** cada versão tem um `versionCode` maior que a anterior.
- O Android não instala uma versão com `versionCode` **menor** por cima de uma maior (ex.: 1.0.x por cima da 1.1.0):
  para testar uma versão antiga, desinstale o app antes (o progresso fica salvo na conta, no servidor).
- As versões antigas foram **regeneradas a partir do código de cada tag** em 11/11/2026: o conteúdo é o mesmo do que
  foi entregue na época, mas os arquivos não são byte a byte iguais aos originais (que não tinham sido guardados).
- Todas são APKs de teste (debug), assinados com a chave de depuração deste computador.

## Como lançar uma versão nova

```bash
cd frontend
npm run release -- 1.2 "Resumo do que mudou"
```

O script aumenta o `versionCode`, troca o `versionName`, gera o APK em `releases/Signa-1.2.0.apk` e acrescenta
a linha nesta tabela. Depois: faça o commit, crie a tag (o script mostra os comandos) e publique o APK no link que o
painel usa (Configurações → Atualização do app).
