# Signa Ludus — Frontend

React 18 + Vite. Servido como site estático, separado da API. Pronto para virar APK (Capacitor).

## Rodando

```bash
cp .env.example .env     # VITE_API_URL = endereço da API (outro servidor)
npm install
npm run dev              # http://localhost:5173
npm run build            # gera dist/ (estático)
```

No celular pela rede: `npm run dev:https` (a câmera exige https). Para evitar bloqueio de conteúdo
misto com a API em http, use `VITE_API_URL=/api` e `VITE_PROXY_TARGET=http://localhost:8080/api/v1`.

## APK (Android)

O APK empacota este mesmo frontend com o [Capacitor](https://capacitorjs.com) (pasta `android/`).
Assim o avatar VLibras e o tradutor (MediaPipe) funcionam como no navegador, sem reescrever nada.

Requisitos na máquina: JDK 21 e Android SDK (Android Studio instala os dois).

```bash
cp .env.android.example .env.android   # VITE_API_URL = API pública em https
npm run apk:debug                      # gera android/app/build/outputs/apk/debug/app-debug.apk
```

- O backend precisa aceitar a origem do app: inclua `https://localhost` em `FRONTEND_URL`.
- O app usa `https://localhost` como origem, então uma API em `http://` é bloqueada (conteúdo misto).
  Só para testar com a API do PC na mesma rede Wi-Fi, mude temporariamente
  `"allowMixedContent": true` em `capacitor.config.json` e use `VITE_API_URL=http://IP-DO-PC:8080/api/v1`.
- Permissões declaradas em `android/app/src/main/AndroidManifest.xml`: internet, câmera (tradutor) e vibração.
- APK para publicar na loja: `cd android && gradlew bundleRelease` com uma chave de assinatura própria.

## Estrutura

```
src/
  api/          cliente HTTP único (http-client.js) + um módulo por recurso
  context/      sessão (AuthContext) e preferências (SettingsContext: tema, fonte, contraste, sons)
  components/   ícones, ilustrações SVG do protótipo, layout (cabeçalho, navegação), diálogo de sinal
  hooks/        useAsyncData (carregando/erro/recarregar)
  features/
    vlibras/    avatar VLibras sobre o quadro do exercício (vlibras-player.js + SignAvatar.jsx)
    translator/ tradutor em tempo real: useHandCamera, useSignTranslator e engine/ (motor de reconhecimento)
  pages/        uma pasta por tela (login, cadastro, trilha, atividade, ranking, assistente, perfil,
                dicionário, configurações, câmera), cada uma com seu CSS
  styles/       theme.css (cores medidas no protótipo, claro/escuro) e global.css
public/
  mediapipe/    runtime WebAssembly e modelos de mão/corpo (offline no APK)
  modelos/      modelo LSTM das palavras com movimento
```

Rotas com `HashRouter`: funcionam em qualquer hospedagem estática e dentro do APK sem configurar o servidor.

## Avatar VLibras

O avatar dos exercícios é o do VLibras (governo federal, LGPL-3.0, github.com/spbgovbr-vlibras), carregado de
vlibras.gov.br. O nome do sinal é enviado aos servidores do VLibras. O app toca a glosa revisada com `play()`
(sem tradução automática), confere antes se a glosa existe no dicionário do VLibras (senão o avatar soletraria a
resposta), esconde legenda e controles e desliga o "clique para traduzir" do widget.

## Tradutor

Tudo roda no aparelho (MediaPipe num Web Worker); nenhuma imagem é enviada. O motor em
`features/translator/engine/` veio do projeto anterior sem mudanças de lógica (nomes internos em português);
`useHandCamera` e `useSignTranslator` são a camada nova que a tela usa.
