# Signa Ludus

App para aprender Libras, em três partes independentes (podem rodar em máquinas diferentes):

```
APK (frontend) ──► BACKEND ──► SERVIDOR DE GERENCIAMENTO ──► MongoDB
```

- [`frontend/`](frontend/README.md): app React (site estático / APK com Capacitor); fala só com o backend (`VITE_API_URL`).
- [`backend/`](backend/README.md): API do app, sem banco; intermedia o APK e o servidor.
- [`server/`](server/README.md): servidor de gerenciamento; dono do banco e das regras, com o painel administrativo em
  `http://127.0.0.1:8090/admin` ([docs/PAINEL-ADMIN.md](docs/PAINEL-ADMIN.md)).

Desenvolvimento local (Windows): `powershell -ExecutionPolicy Bypass -File scripts/restart-dev.ps1 -Force` sobe
banco, servidor e painel (127.0.0.1:8090 e /admin), backend (8080) e frontend (5173).

Para o front em outro domínio, coloque a origem dele em `FRONTEND_URL` no backend (CORS).

Documentação técnica (arquitetura, referência de módulos e conquistas): [`docs/`](docs/README.md).

## Direitos autorais

Copyright (c) 2026 Equipe Signa Ludus. Todos os direitos reservados.

O código, o conteúdo didático, o nome "Signa" / "Signa Ludus" e o logotipo são da Equipe Signa Ludus. Este
repositório é público só para consulta: copiar, modificar, redistribuir ou usar comercialmente exige
autorização por escrito. Detalhes em [`LICENSE`](LICENSE). Componentes de terceiros seguem as próprias licenças.
