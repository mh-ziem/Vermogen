# syntax=docker/dockerfile:1
#
# Imagem do Vermögen (SAD DT-05, DT-15 e §6).
# Contexto de build: raiz do repositório. Exemplo local:
#   docker build -f deploy/Dockerfile -t vermogen:teste .
# O que entra e o que fica fora do contexto: deploy/Dockerfile.dockerignore.
#
# Três etapas:
#   build  instala tudo (inclusive dependências de desenvolvimento) e roda "npm run build"
#   deps   instala só as dependências de produção do apps/api
#   final  junta dist/ e node_modules de produção, roda como uid 1000, sem segredos

# Node 24 LTS com versão fixa. Manter igual ao "node-version" de .github/workflows/ci.yml.
ARG NODE_IMAGE=node:24.22.3-trixie-slim

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /app

# Primeiro só os manifestos, para o cache do "npm ci" sobreviver a mudanças de código.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# Com workspaces, "--omit=dev" ainda deixa ferramentas de desenvolvimento (peers opcionais
# do apps/web) e as dependências do apps/web. O script remove tudo que o apps/api não usa.
COPY deploy/podar-dependencias.mjs /tmp/podar-dependencias.mjs
RUN npm ci --omit=dev --no-audit --no-fund \
 && node /tmp/podar-dependencias.mjs \
 && npm cache clean --force

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS final

# Versão da imagem, passada pelo pipeline (tag vX.Y.Z -> X.Y.Z). Só rótulo; não é segredo.
ARG VERSAO=0.0.0-dev
LABEL org.opencontainers.image.title="vermogen" \
      org.opencontainers.image.source="https://github.com/mh-ziem/Vermogen" \
      org.opencontainers.image.version="${VERSAO}"

ENV NODE_ENV=production \
    PORT=3000 \
    TZ=America/Sao_Paulo

WORKDIR /app

# Mesma árvore do repositório sob /app (a API acha apps/web/dist pelo caminho relativo).
# Os arquivos ficam com dono root: o app (uid 1000) lê, mas não altera.
COPY --from=deps  /app/node_modules          ./node_modules
COPY --from=build /app/package.json          ./package.json
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist         ./apps/api/dist
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/apps/web/dist         ./apps/web/dist

# Usuário "node" da imagem oficial: uid 1000, gid 1000 (SAD §6).
USER 1000:1000

EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["node", "apps/api/dist/main.js"]
