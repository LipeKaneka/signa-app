# Signa Ludus — Backend

API do app (Node 20+, Express 5). **Não tem banco**: é a camada entre o APK e o servidor de gerenciamento
(`../server`). Recebe as requisições do app, confere o token, valida, limita e pede os dados ao servidor pela API
interna. Detalhes: [docs/REFERENCIA-BACKEND.md](../docs/REFERENCIA-BACKEND.md).

## Arquitetura

```
ROTA (route-*.js)          caminhos + middlewares (auth, limites)
  ↓
CONTROLLER (controller-*)  valida a requisição e chama o service
  ↓
SERVICE (service-*)        orquestra: pede ao servidor e devolve no formato do app
  ↓
clients/server-client.js   único contato com o servidor (X-Service-Key, timeout, erros amigáveis)
```

```
src/
  clients/      server-client.js (API interna do servidor)
  config/       variáveis de ambiente, limites de ranking e senha
  routes/       rotas (index.js monta tudo em /api/v1)
  controllers/  validação de entrada
  services/     orquestração + assistente com IA
  middlewares/  auth (JWT + sessão no servidor), rate limit, erros
  utils/        tokens JWT, validadores, erros HTTP
tests/          contrato do app: sobem o servidor de gerenciamento + MongoDB em memória
```

Respostas: sucesso `{ message?, ...dados }`, erro `{ error }`. Servidor fora do ar: `503` com mensagem amigável.

## Rodando

O servidor de gerenciamento precisa estar no ar (veja `../server/README.md`).

```bash
cp .env.example .env      # JWT_SECRET (128+) e SERVER_SERVICE_KEY (= SERVICE_KEY do server/.env)
npm install
npm run dev               # http://localhost:8080/api/v1
npm test
```

`SERVER_URL` aponta para a API interna (padrão `http://127.0.0.1:8090/internal/v1`); servidor em outra máquina =
trocar só essa variável. `FRONTEND_URL` aceita várias origens separadas por vírgula (site e app Capacitor).
`ANTHROPIC_API_KEY` é opcional: sem ela o assistente responde só com o dicionário.
`CONTENT_VERSION_TTL_MS` (padrão 10000): de quanto em quanto tempo o backend confere se o conteúdo público mudou no
servidor; dicionário, eventos e `/app-config` ficam em cache até a versão do conteúdo mudar.

## Endpoints (/api/v1) — os mesmos de antes da separação, mais os da Etapa 4

| Método | Caminho | Descrição |
|---|---|---|
| GET | /health | status do backend |
| POST | /auth/register | cria conta `{nickname, email, password}` → `{token, user}` |
| POST | /auth/login | `{email, password}` → `{token, user}` |
| POST | /auth/password-reset/request | `{email}` → envia o código (mesma resposta exista ou não a conta) |
| POST | /auth/password-reset/verify | `{email, code}` → `{valid}` ou 400 |
| POST | /auth/password-reset/confirm | `{email, code, password}` → troca a senha e devolve `{token, user}` |
| GET | /profile | perfil (com `user.level`) + conquistas |
| PATCH | /profile | `nickname, city, showInRanking`; `email/password` exigem `currentPassword` |
| DELETE | /profile | exclui a conta `{currentPassword}` |
| GET | /trail | módulos e atividades com status locked/available/completed |
| POST | /activities/:id/attempts | inicia tentativa (perguntas sem gabarito) |
| POST | /attempts/:id/answers | `{questionKey, optionId}` → correção |
| POST | /attempts/:id/finish | nota, XP (`xpMultiplier` do evento), ofensiva, nível, conquistas novas |
| GET | /ranking?metric=activities\|xp\|streak&limit= | top + posição + variação + vizinhos |
| GET | /dictionary?search=&category=&page=&limit= | verbetes |
| GET | /dictionary/categories | categorias |
| GET | /dictionary/:slug | um verbete |
| GET | /events/active | eventos valendo agora (ex.: 2x XP); sem login |
| GET | /app-config | `{settings, levels, contentVersion}`: textos e regras públicas; sem login |
| POST | /chat | `{question, history?}` → `{answer, signs, source}` |

Regras de pontuação, conquistas e o conteúdo ficam no servidor (`../server`).
