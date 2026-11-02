# Signa Ludus — Servidor de gerenciamento

Núcleo do projeto (Node 20+, Express 5, MongoDB/Mongoose): **único dono do banco** e das regras que gravam dados
(correção, XP, ofensiva, conquistas, trilha, ranking, dicionário). Só o backend fala com ele, pela API interna.
Também serve o **painel administrativo** (`/admin`) e a API dele (`/admin/api/v1`). Detalhes:
[docs/REFERENCIA-SERVIDOR.md](../docs/REFERENCIA-SERVIDOR.md) e [docs/PAINEL-ADMIN.md](../docs/PAINEL-ADMIN.md).

```
src/
  config/       env, padrões de regras/conquistas/níveis, configurações editáveis, permissões do painel
  database/     conexão com o MongoDB
  models/       usuário, sinal, módulo, atividade, tentativa, conquista, evento, nível, configuração,
                administrador, sessão do painel, auditoria
  services/     regras de negócio
  controllers/  controller-internal-*.js (API interna) e admin/ (API do painel)
  routes/       route-internal.js (/internal/v1) e route-admin.js (/admin/api/v1)
  middlewares/  chave de serviço, carregar usuário, sessão/papel/CSRF do painel, erros
  seeds/        conteúdo inicial (sinais com glosa VLibras e trilha)
admin-panel/    painel web (React + Vite); o build (dist/) é servido em /admin
scripts/        local-database.js (MongoDB local sem instalar nada), create-owner.js (primeiro owner do painel)
tests/          API interna, regras de pontuação e API do painel
```

## Rodando (desenvolvimento)

```bash
cp .env.example .env      # SERVICE_KEY: gere um segredo e use o MESMO valor em backend/.env (SERVER_SERVICE_KEY)
npm install
npm run db:local          # MongoDB local (dados em server/.data) — deixe rodando
npm run seed              # sinais, trilha, conquistas e níveis padrão (pode rodar de novo; não desfaz edições)
cd admin-panel && npm install && npm run build && cd ..   # painel (o restart-dev.ps1 faz isso sozinho)
npm run admin:create-owner -- --email voce@exemplo.com --name "Seu nome"   # primeiro owner do painel
npm run dev               # http://127.0.0.1:8090/internal/v1 e painel em http://127.0.0.1:8090/admin
npm test
```

Ou, da raiz do projeto, `scripts/restart-dev.ps1 -Force` sobe banco, servidor, backend e frontend na ordem certa.

## Segurança

- `HOST=127.0.0.1`: na mesma máquina do backend, ninguém de fora alcança o servidor. Em outra máquina, use o IP
  da rede privada, firewall e HTTPS entre backend e servidor.
- Toda rota de `/internal/v1` exige `X-Service-Key`. O APK nunca tem essa chave.
- Rotas de usuário (`/users/:userId/...`) respondem 401 se a conta não existe e 403 se está bloqueada.
- Painel: contas próprias com papéis, sessão em cookie httpOnly/SameSite=Strict, proteção CSRF, limite de
  tentativas de login e auditoria de tudo. Ver [docs/PAINEL-ADMIN.md](../docs/PAINEL-ADMIN.md).

## API interna (/internal/v1)

| Método | Caminho | Faz |
|---|---|---|
| GET | /health | status |
| POST | /auth/register | cria conta → `{id, user}` |
| POST | /auth/verify-credentials | confere e-mail/senha → `{id, user}` |
| POST | /auth/password-reset/request, /verify, /confirm | recuperação de senha por código de 6 dígitos (ver service-password-reset.js) |
| GET | /users/:userId/session | conta ativa? |
| GET | /users/:userId/profile | perfil (com `user.level`) + conquistas ativas |
| PATCH | /users/:userId | `{changes, currentPassword?}` → `{user}` |
| DELETE | /users/:userId | `{currentPassword}` → `{deleted}` |
| GET | /users/:userId/trail | trilha com status |
| POST | /users/:userId/attempts | `{activityId}` → tentativa sem gabarito |
| POST | /users/:userId/attempts/:attemptId/answers | `{questionKey, optionId}` → correção |
| POST | /users/:userId/attempts/:attemptId/finish | nota, XP × evento (`xpMultiplier`), ofensiva, nível, conquistas novas |
| GET | /users/:userId/ranking?metric=&limit= | ranking do ponto de vista do usuário |
| GET | /dictionary, /dictionary/categories, /dictionary/signs/:slug, /dictionary/mentioned?text= | dicionário |
| GET | /content/version | `{version}` do conteúdo (o backend descarta o cache quando muda) |
| GET | /events/active | `{events}` valendo agora |
| GET | /app-config | `{settings, levels, contentVersion}` públicos |

## Regras

- Padrões (editáveis na coleção `settings`): XP 10 por acerto + 10 de bônus em atividade perfeita; refazer atividade
  já aprovada vale 2 por acerto; aprovação com 70%. Evento de XP ativo multiplica tudo (vale o maior).
- Conquistas, eventos, níveis e regras ficam no banco: ver [docs/CONQUISTAS.md](../docs/CONQUISTAS.md).
- Cada pergunta só pode ser respondida uma vez por tentativa (garantido no banco).
- Ofensiva contada em dias no fuso America/Sao_Paulo.
- Cada sinal tem `vlibrasGloss` (avatar VLibras, governo federal, LGPL-3.0); `glossReviewed: false` até alguém
  fluente em Libras conferir.
