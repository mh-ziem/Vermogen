# Vermögen

Projetor de caixa pessoal. Requisitos em [docs/PRD.md](docs/PRD.md); arquitetura em [docs/SAD.md](docs/SAD.md).

## Desenvolvimento local

Precisa de Node 24.15 ou superior e Docker.

```bash
npm ci
cp .env.example .env
npm run dev:db          # PostgreSQL descartável em 127.0.0.1:54329
npm run typecheck
npm test                # unidade + integração (usa o banco acima)
npm run build
```

Rodar o app compilado (API, tela e migrações no mesmo processo):

```bash
set -a; . ./.env; set +a
PUBLIC_URL=http://127.0.0.1:3000 node apps/api/dist/main.js
node apps/api/dist/cli.js definir-senha    # em outro terminal, com as mesmas variáveis
```

Depois abra http://127.0.0.1:3000.

## Pastas

| Pasta | Conteúdo | Dono (SAD DT-20) |
|---|---|---|
| `apps/api` | NestJS: API, MCP, migrações | Dev |
| `apps/web` | Vue 3 | Dev |
| `deploy/`, `.github/workflows/`, `docs/operacao/` | Imagem, pipeline, roteiros do servidor | DevOps |
| `docs/propostas/` | Propostas de mudança (SAD §8) | Qualquer chat cria |
