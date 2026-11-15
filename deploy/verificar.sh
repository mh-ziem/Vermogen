#!/usr/bin/env bash
# Verificação final do Vermögen no servidor (marco de 29/12, SAD DT-21): QA-01, QA-08 e QA-12.
# Só lê: não para, não sobe e não altera nada (containers, arquivos ou configuração).
#
# Uso, dentro de /srv/vermogen:
#   sudo ./verificar.sh    com sudo, o ss mostra o processo dono de cada porta
#   ./verificar.sh         também funciona, se o seu usuário está no grupo docker
#
# Roteiro: docs/operacao/verificacao-final.md
# Saída: uma linha [OK], [FALHA] ou [VER] por checagem; termina com o total de falhas
# (código de saída 1 se houver alguma).

set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"

PICO_MIB=4096    # QA-12: soma dos limites de memória
REGIME_MIB=1024  # QA-12: uso em regime com Compose
BOOT_MAX_S=600   # QA-08: 10 minutos

falhas=0
ok()     { echo "  [OK]    $*"; }
falha()  { echo "  [FALHA] $*"; falhas=$((falhas + 1)); }
ver()    { echo "  [VER]   $*"; }
titulo() { echo; echo "== $* =="; }

[[ -f compose.yml && -f .env ]] || { echo "ERRO: rode dentro de /srv/vermogen (faltam compose.yml ou .env)" >&2; exit 2; }

PORTA="$(sed -n 's/^VERMOGEN_PORT=//p' .env | tail -n 1)"
VERSAO="$(sed -n 's/^VERMOGEN_VERSION=//p' .env | tail -n 1)"
[[ "$PORTA" =~ ^[0-9]+$ ]] || { echo "ERRO: VERMOGEN_PORT não está preenchida no .env" >&2; exit 2; }

echo "Vermögen: verificação final ($(date '+%F %T'); .env na versão ${VERSAO:-?})"

# ---------------------------------------------------------------- health
titulo "Health em 127.0.0.1"
resp="$(curl -s --max-time 5 -w '\n%{http_code}' "http://127.0.0.1:$PORTA/api/health" || true)"
codigo="${resp##*$'\n'}"
corpo="${resp%$'\n'*}"
echo "    HTTP ${codigo:-sem resposta}: $corpo"
if [[ "$codigo" != "200" ]]; then
  falha "o health não respondeu 200"
elif [[ "$corpo" != *"\"versao\":\"$VERSAO\""* ]]; then
  falha "o health responde, mas a versão não é a do .env ($VERSAO)"
else
  ok "health 200 na versão $VERSAO"
fi

# ---------------------------------------------------------------- QA-01
titulo "QA-01  portas (vista de dentro do servidor; o scan da LAN é feito no PC)"

echo "  Portas que os containers publicam no host:"
for c in vermogen-app vermogen-db; do
  if ! docker inspect "$c" > /dev/null 2>&1; then falha "$c não encontrado"; continue; fi
  pub="$(docker inspect -f '{{range $p, $b := .NetworkSettings.Ports}}{{range $b}}{{.HostIp}}:{{.HostPort}}->{{$p}} {{end}}{{end}}' "$c")"
  pub="${pub% }"
  echo "    $c: ${pub:-nenhuma}"
  case "$c:$pub" in
    "vermogen-app:127.0.0.1:$PORTA->3000/tcp") ok "app publicado só em 127.0.0.1:$PORTA" ;;
    "vermogen-db:")                            ok "banco sem porta publicada" ;;
    *)                                         falha "$c publica algo diferente do esperado: $pub" ;;
  esac
done

# IPs da tailnet do próprio servidor (escutar neles é permitido pelo QA-01).
tailnet=()
mapfile -t tailnet < <(tailscale ip 2>/dev/null || true)
if [[ ${#tailnet[@]} -eq 0 ]]; then
  mapfile -t tailnet < <(ip -o addr show dev tailscale0 2>/dev/null | awk '{split($4, a, "/"); print a[1]}' || true)
fi
eh_tailnet() {
  local t
  for t in "${tailnet[@]}"; do [[ "$1" == "$t" ]] && return 0; done
  return 1
}
[[ ${#tailnet[@]} -gt 0 ]] || ver "não achei o IP da tailnet (tailscale ip); tudo que não é 127.0.0.1 aparece como FORA"

echo "  Portas TCP ouvindo no host fora de 127.0.0.1 (ss -tlnp):"
fora=0
app_no_loopback=0
while read -r _ _ _ local _ resto; do
  porta="${local##*:}"
  end="${local%:*}"
  end="${end#[}"; end="${end%]}"; end="${end%%%*}"
  case "$end" in
    127.*|::1)
      if [[ "$porta" == "$PORTA" ]]; then app_no_loopback=1; fi
      continue ;;
  esac
  if eh_tailnet "$end"; then
    echo "    tailnet  $local  $resto"
    continue
  fi
  echo "    FORA     $local  $resto"
  fora=$((fora + 1))
  if [[ "$porta" == "$PORTA" ]]; then falha "a porta do app ($PORTA) ouve fora de 127.0.0.1: $local"; fi
  if [[ "$porta" == "5432" ]]; then falha "há algo ouvindo na 5432 fora de 127.0.0.1 ($local); veja se é de outro app no /srv/REGISTRY.md"; fi
done < <(ss -H -tlnp 2>/dev/null)

if [[ $app_no_loopback -eq 1 ]]; then ok "porta do app ouvindo em 127.0.0.1:$PORTA"; else falha "nada ouvindo em 127.0.0.1:$PORTA"; fi
if [[ $fora -gt 0 ]]; then
  ver "$fora porta(s) FORA de 127.0.0.1/tailnet: a 22 (SSH) é esperada; qualquer outra precisa ser de outro app do /srv/REGISTRY.md"
else
  ok "nenhuma porta fora de 127.0.0.1/tailnet"
fi

# ---------------------------------------------------------------- QA-12
titulo "QA-12  memória"

echo "  Declarado no compose (docker compose config; bytes):"
docker compose config 2>/dev/null \
  | awk '/^services:/ {s = 1; next} /^[^ ]/ {s = 0} s && /^  [^ ]/ {print "    " $0} s && /^    (mem_limit|memswap_limit|cpus):/ {print "    " $0}' \
  || falha "docker compose config falhou"

echo "  Em vigor nos containers (docker inspect):"
soma=0
ids=()
mapfile -t servicos < <(docker compose config --services 2>/dev/null || true)
for s in "${servicos[@]}"; do
  id="$(docker compose ps -q "$s" 2>/dev/null || true)"
  if [[ -z "$id" ]]; then falha "$s: container não está rodando"; continue; fi
  ids+=("$id")
  read -r nome mem swap cpu < <(docker inspect -f '{{.Name}} {{.HostConfig.Memory}} {{.HostConfig.MemorySwap}} {{.HostConfig.NanoCpus}}' "$id")
  nome="${nome#/}"
  echo "    $nome: memória $((mem / 1048576)) MiB, memória+swap $((swap / 1048576)) MiB, CPU $(awk -v n="$cpu" 'BEGIN {printf "%.2f", n / 1e9}')"
  if [[ "$mem" -eq 0 ]]; then falha "$nome está sem limite de memória"; fi
  soma=$((soma + mem))
done
soma_mib=$((soma / 1048576))
if [[ ${#ids[@]} -gt 0 && $soma_mib -gt 0 && $soma_mib -le $PICO_MIB ]]; then
  ok "pico: soma dos limites = $soma_mib MiB (≤ $PICO_MIB MiB)"
else
  falha "pico: soma dos limites = $soma_mib MiB (esperado entre 1 e $PICO_MIB MiB)"
fi

if [[ ${#ids[@]} -gt 0 ]]; then
  echo "  Uso agora (docker stats --no-stream):"
  stats="$(docker stats --no-stream --format '{{.Name}}|{{.MemUsage}}|{{.MemPerc}}|{{.CPUPerc}}|{{.PIDs}}' "${ids[@]}")"
  while IFS='|' read -r n m p c q; do
    echo "    $n: memória $m ($p), CPU $c, processos $q"
  done <<<"$stats"
  uso_mib="$(awk -F'|' '
    function mib(v,  n, u) { n = v + 0; u = v; sub(/^[0-9.]+/, "", u)
      if (u == "B") return n / 1048576; if (u == "KiB" || u == "kB") return n / 1024
      if (u == "GiB" || u == "GB") return n * 1024; return n }
    { split($2, a, " / "); t += mib(a[1]) } END { printf "%d", t }' <<<"$stats")"
  if [[ $uso_mib -le $REGIME_MIB ]]; then
    ok "regime: uso somado = $uso_mib MiB (≤ $REGIME_MIB MiB; leitura de um instante)"
  else
    falha "regime: uso somado = $uso_mib MiB (> $REGIME_MIB MiB)"
  fi
fi

# ---------------------------------------------------------------- QA-08
titulo "QA-08  subida sozinha depois do reboot"

for u in docker containerd tailscaled; do
  st="$(systemctl is-enabled "$u" 2>/dev/null || true)"
  if [[ "$st" == "enabled" ]]; then ok "$u: enabled"; else falha "$u: ${st:-não encontrado} (precisa ser enabled)"; fi
done

for c in vermogen-app vermogen-db; do
  linha="$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}} {{.State.StartedAt}} {{.RestartCount}}' "$c" 2>/dev/null || true)"
  read -r politica estado saude inicio reinicios <<<"${linha:-? ? ? ? ?}"
  echo "    $c: restart=$politica estado=$estado saúde=$saude iniciado=$inicio reinícios=$reinicios"
  if [[ "$politica" == "unless-stopped" && "$saude" == "healthy" ]]; then ok "$c: unless-stopped e healthy"; else falha "$c: esperado restart=unless-stopped e saúde=healthy"; fi
done

boot="$(awk '/^btime/ {print $2}' /proc/stat)"
agora="$(date +%s)"
desde=$((agora - boot))
echo "    boot do kernel: $(date -d "@$boot" '+%F %T') (há $desde s)"
sa="$(systemd-analyze 2>/dev/null || true)"
echo "    systemd-analyze: ${sa%%$'\n'*}"
if [[ $desde -gt 1800 ]]; then
  ver "o último boot foi há mais de 30 min: a medida boot → healthy só vale logo depois do teste de reboot"
else
  eventos="$(docker events --since "$boot" --until "$agora" --filter type=container --filter container=vermogen-app --format '{{.Time}} {{.Action}}' 2>/dev/null || true)"
  t_ok="$(grep -m1 ' health_status: healthy$' <<<"$eventos" | cut -d' ' -f1 || true)"
  if [[ -z "$t_ok" ]]; then
    ver "não achei o evento healthy do app desde o boot (o Docker guarda poucos eventos); vale o cronômetro do PC"
  elif [[ $((t_ok - boot)) -le $BOOT_MAX_S ]]; then
    ok "boot do kernel → app healthy em $((t_ok - boot)) s (≤ $BOOT_MAX_S s)"
  else
    falha "boot do kernel → app healthy em $((t_ok - boot)) s (> $BOOT_MAX_S s)"
  fi
fi

echo "  tailscale serve status:"
serve="$(tailscale serve status 2>&1 || true)"
sed 's/^/    /' <<<"$serve"
if [[ "$serve" =~ 127\.0\.0\.1:${PORTA}([^0-9]|$) ]]; then ok "tailscale serve aponta para 127.0.0.1:$PORTA"; else falha "tailscale serve não aponta para 127.0.0.1:$PORTA"; fi

# ---------------------------------------------------------------- resumo
echo
if [[ $falhas -eq 0 ]]; then
  echo "RESUMO: nenhuma FALHA. Confira as linhas [VER], se houver."
else
  echo "RESUMO: $falhas FALHA(s). Cole a saída inteira no chat."
  exit 1
fi
