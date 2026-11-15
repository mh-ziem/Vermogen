#!/usr/bin/env bash
# Atualiza o Vermögen no servidor para outra versão da imagem (SAD DT-17).
#
# Uso, dentro de /srv/vermogen:
#   ./atualizar.sh 0.2.0
#
# O que faz, nesta ordem:
#   1. baixa a imagem nova (se não existir, para aqui, sem mexer em nada)
#   2. para o app, para nada ser gravado depois do dump
#   3. faz o dump do banco em backups/ (formato custom do pg_dump) e mantém só os 5 mais recentes
#   4. troca VERMOGEN_VERSION no .env e sobe o app novo (as migrações rodam na subida)
#   5. espera o app ficar "healthy" e confere se o /api/health devolve a versão nova
# Se algo falhar depois do dump, para, não apaga o dump e mostra como voltar.
#
# Variáveis opcionais:
#   VERMOGEN_ESPERA=300   segundos de espera pelo "healthy" (padrão 300)
#   VERMOGEN_SEM_PULL=1   não baixa a imagem (só para teste com imagens locais)

set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"

NOVA="${1:-}"
ESPERA="${VERMOGEN_ESPERA:-300}"
MANTER=5

erro() { echo "ERRO: $*" >&2; exit 1; }
info() { echo "==> $*"; }

[[ "$NOVA" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || erro "informe a versão nova no formato X.Y.Z (sem o \"v\"). Ex.: ./atualizar.sh 0.2.0"
[[ -f compose.yml && -f .env ]] || erro "rode dentro de /srv/vermogen (faltam compose.yml ou .env)"
[[ -d backups ]] || erro "a pasta backups/ não existe"

ANTERIOR="$(sed -n 's/^VERMOGEN_VERSION=//p' .env | tail -n 1)"
[[ -n "$ANTERIOR" ]] || erro "VERMOGEN_VERSION não está preenchida no .env"
[[ "$ANTERIOR" != "$NOVA" ]] || erro "o .env já está na versão $NOVA"

estado_db="$(docker inspect -f '{{.State.Health.Status}}' vermogen-db 2>/dev/null || true)"
[[ "$estado_db" == "healthy" ]] || erro "o banco (vermogen-db) não está healthy (estado: ${estado_db:-não encontrado}); nada foi alterado"

info "Atualizando de $ANTERIOR para $NOVA"

# 1. Imagem nova primeiro: se a tag não existir, nada muda.
if [[ "${VERMOGEN_SEM_PULL:-}" == "1" ]]; then
  info "Pulando o download da imagem (VERMOGEN_SEM_PULL=1)"
  docker image inspect "ghcr.io/mh-ziem/vermogen:$NOVA" > /dev/null \
    || erro "a imagem ghcr.io/mh-ziem/vermogen:$NOVA não existe localmente; nada foi alterado"
else
  info "Baixando ghcr.io/mh-ziem/vermogen:$NOVA"
  VERMOGEN_VERSION="$NOVA" docker compose pull vermogen-app \
    || erro "não consegui baixar a versão $NOVA (tag existe? login no GHCR?); nada foi alterado"
fi

# 2. Para o app antes do dump.
info "Parando o app"
docker compose stop vermogen-app

# 3. Dump.
umask 077
DUMP="backups/vermogen_$(date +%Y-%m-%d_%H%M%S)_v${ANTERIOR}.dump"
info "Fazendo o dump em $DUMP"
if ! docker compose exec -T vermogen-db pg_dump -U vermogen -d vermogen -Fc > "$DUMP.parcial"; then
  rm -f "$DUMP.parcial"
  docker compose start vermogen-app > /dev/null || true
  erro "o pg_dump falhou; o app foi religado na versão $ANTERIOR e nada mais foi alterado"
fi
mv "$DUMP.parcial" "$DUMP"
# Confere se o arquivo é um dump legível.
if ! docker compose exec -T vermogen-db pg_restore --list < "$DUMP" > /dev/null; then
  docker compose start vermogen-app > /dev/null || true
  erro "o dump $DUMP não pôde ser lido pelo pg_restore; o app foi religado na versão $ANTERIOR"
fi
info "Dump ok ($(du -h "$DUMP" | cut -f1))"

# Mantém só os $MANTER dumps mais recentes. O nome começa pela data, então a ordem
# alfabética do glob já é a ordem cronológica.
shopt -s nullglob
dumps=(backups/vermogen_*.dump)
shopt -u nullglob
for ((i = 0; i < ${#dumps[@]} - MANTER; i++)); do
  info "Removendo dump antigo: ${dumps[i]}"
  rm -f -- "${dumps[i]}"
done

como_voltar() {
  cat >&2 <<AJUDA

A atualização para $NOVA FALHOU. O dump de antes está em:
  $PWD/$DUMP

Para voltar à versão $ANTERIOR (roteiro completo: docs/operacao/atualizacao.md, "Como voltar"):

  cd $PWD
  docker compose logs --tail 100 vermogen-app        # guarde o erro para o chat
  docker compose stop vermogen-app
  sed -i 's/^VERMOGEN_VERSION=.*/VERMOGEN_VERSION=$ANTERIOR/' .env
  docker compose exec -T vermogen-db dropdb -U vermogen --force vermogen
  docker compose exec -T vermogen-db createdb -U vermogen vermogen
  docker compose exec -T vermogen-db pg_restore -U vermogen -d vermogen --exit-on-error --single-transaction < $DUMP
  docker compose up -d
AJUDA
}

# 4. Troca a versão e sobe.
info "Trocando VERMOGEN_VERSION no .env para $NOVA"
cp -p .env .env.antes-da-atualizacao
sed -i "s/^VERMOGEN_VERSION=.*/VERMOGEN_VERSION=$NOVA/" .env

info "Subindo o app $NOVA (as migrações rodam agora)"
if ! docker compose up -d vermogen-app; then
  como_voltar
  exit 1
fi

# 5. Espera o healthy.
info "Esperando o app ficar healthy (até ${ESPERA}s)"
inicio=$SECONDS
while :; do
  estado="$(docker inspect -f '{{.State.Health.Status}}' vermogen-app 2> /dev/null || echo ausente)"
  [[ "$estado" == "healthy" ]] && break
  if (( SECONDS - inicio >= ESPERA )); then
    echo "O app não ficou healthy em ${ESPERA}s (estado: $estado)." >&2
    como_voltar
    exit 1
  fi
  sleep 5
done
info "App healthy em $((SECONDS - inicio))s"

# Confere a versão pelo próprio health (o fetch roda dentro do container; o host não precisa de curl).
versao="$(docker compose exec -T vermogen-app node -e \
  "fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(j=>console.log(j.versao)).catch(()=>console.log('erro'))" \
  | tr -d '\r')"
if [[ "$versao" != "$NOVA" ]]; then
  echo "O /api/health respondeu a versão \"$versao\", e não $NOVA." >&2
  como_voltar
  exit 1
fi

info "Atualizado para $NOVA. Dump de antes: $PWD/$DUMP"
info "Se tudo estiver bem no navegador, pode apagar .env.antes-da-atualizacao"
