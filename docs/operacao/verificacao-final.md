# Verificação final do Vermögen (marco de 29/12)

> Roda depois de implantar a `v1.0.0`. Fecha QA-01 (portas), QA-08 (reboot) e QA-12 (memória) do PRD, conforme o SAD DT-21.
> Quem executa: só o Matheus (PRD R6). Cada bloco diz **onde** rodar: no **servidor** (pelo `ssh`) ou no **PC** (no WSL).
> Marcadores (`<acesso-ssh>`, `<porta>`, `<nome>.<tailnet>.ts.net`, `<ip-da-lan-do-servidor>`, `<ip-da-tailnet-do-servidor>`): os mesmos de [primeira-implantacao.md](primeira-implantacao.md#como-ler).
> Tempo estimado: 20 a 30 minutos, contando o reboot.

O script `deploy/verificar.sh` faz as checagens de dentro do servidor. Ele **só lê**: não para, não sobe e não altera nada. Cada checagem sai como `[OK]`, `[FALHA]` ou `[VER]` (olhar com atenção), e a última linha é o `RESUMO`.

## 0. Antes de começar

- [ ] A `v1.0.0` está implantada (roteiro de atualização, `docs/operacao/atualizacao.md`) e os dois containers estão `(healthy)` em `docker compose ps`.
- [ ] Nenhum container do Vermögen foi parado com `docker compose stop`: com `unless-stopped`, ele continuaria parado depois do reboot.

## 1. Copiar o script para o servidor (uma vez)

**No PC (WSL):**

```bash
cd ~/codes/Vermogen
git fetch origin --tags
git show v1.0.0:deploy/verificar.sh > /tmp/vermogen-verificar.sh
scp /tmp/vermogen-verificar.sh <acesso-ssh>:/srv/vermogen/verificar.sh
rm /tmp/vermogen-verificar.sh
```

**No servidor:**

```bash
chmod 755 /srv/vermogen/verificar.sh
```

## 2. Checagens no servidor (antes do reboot)

**No servidor:**

```bash
cd /srv/vermogen && sudo ./verificar.sh
```

O `sudo` só serve para o `ss` mostrar o processo dono de cada porta. Esperado:

| Bloco | Esperado |
|---|---|
| Health | `[OK] health 200 na versão 1.0.0` |
| QA-01 | App publicado só em `127.0.0.1:<porta>`; banco sem porta publicada; nenhuma linha `FORA` além da `22` (SSH) e de portas de outros apps do `/srv/REGISTRY.md` |
| QA-12 | `mem_limit: "536870912"` nos dois serviços; `pico: soma dos limites = 1024 MiB (≤ 4096 MiB)`; `regime: uso somado` bem abaixo de 1024 MiB |
| QA-08 | `docker`, `containerd` e `tailscaled` `enabled`; os dois containers `unless-stopped e healthy`; `tailscale serve` apontando para `127.0.0.1:<porta>` |

Antes do reboot, a linha `[VER] o último boot foi há mais de 30 min` é normal.

Se quiser conferir o QA-12 à mão, sem o script (**no servidor**):

```bash
cd /srv/vermogen
docker compose config | grep -E 'mem_limit|memswap_limit|cpus'
docker inspect -f '{{.Name}} memoria={{.HostConfig.Memory}}' vermogen-app vermogen-db
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' vermogen-app vermogen-db
```

A soma dos limites é 2 × 536870912 bytes = 1 GiB, abaixo dos 4 GiB do pico. Para o regime, vale a leitura com o app sem uso há alguns minutos, fora de importação.

## 3. QA-01: scan a partir da LAN

**No PC (WSL), conectado à rede de casa.** São os mesmos comandos do passo 12 (CA1) da [primeira implantação](primeira-implantacao.md#ca1--portas-só-em-127001-qa-01), onde estão também a instalação do `nmap` e a alternativa no PowerShell:

```bash
nmap -Pn -sT -p- --open <ip-da-lan-do-servidor>
nmap -Pn -sT -p <porta>,5432,443 <ip-da-tailnet-do-servidor>
```

Esperado:

- LAN: nem `<porta>`, nem `5432`, nem `443` aparecem. A `22` é esperada; qualquer outra precisa estar no `REGISTRY.md` como de outro app.
- Tailnet: `443/tcp open`; `<porta>` e `5432` como `closed` ou `filtered`.

## 4. QA-08: teste de reboot

1. **No PC (WSL)**, deixe o cronômetro rodando (o mesmo do passo 12, CA2, da primeira implantação):

   ```bash
   URL=https://<nome>.<tailnet>.ts.net
   inicio=$(date +%s)
   while curl -fs --max-time 5 -o /dev/null "$URL/api/health"; do sleep 2; done
   echo "caiu após $(( $(date +%s) - inicio )) s; esperando voltar..."
   until curl -fs --max-time 5 -o /dev/null "$URL/api/health"; do sleep 10; done
   echo "VOLTOU: $(( $(date +%s) - inicio )) s desde o reboot"
   ```

2. **No servidor:**

   ```bash
   sudo reboot
   ```

3. Esperado no PC: `VOLTOU` com **menos de 600 s**. É esse o número do QA-08: conta o desligamento, o boot e o caminho inteiro pela tailnet com HTTPS.

4. Assim que voltar, em **até 10 minutos** (o Docker guarda poucos eventos), **no servidor** (novo `ssh`):

   ```bash
   cd /srv/vermogen && sudo ./verificar.sh
   ```

   Esperado: tudo como no passo 2 e mais a linha `[OK] boot do kernel → app healthy em N s (≤ 600 s)`, sem você ter rodado nada além do `ssh`. Essa medida começa no boot do kernel, então não conta a BIOS; a primeira linha do `systemd-analyze` mostra essa parte quando o firmware informa.

## 5. Se algo falhar

| Falha | O que fazer |
|---|---|
| Health não responde 200, ou a versão não é `1.0.0` | `docker compose ps` e `docker compose logs --tail 100 vermogen-app`; use a tabela de sintomas do passo 8 da [primeira implantação](primeira-implantacao.md#8-subir) |
| App publicado em outro endereço, banco com porta, container sem limite ou soma acima de 4 GiB | O `compose.yml` do servidor não é o da tag. Compare **no PC**, dentro de `~/codes/Vermogen`: `ssh <acesso-ssh> cat /srv/vermogen/compose.yml \| diff <(git show v1.0.0:deploy/compose.yml) -` e cole a diferença no chat |
| O scan da LAN acha `<porta>` ou `5432` | Pare o app até corrigir (os dados ficam no volume): **no servidor**, `cd /srv/vermogen && docker compose down`. Cole a saída do script e do `nmap` no chat |
| O scan acha outra porta que não está no `REGISTRY.md` | Não mexa sozinho: cole no chat. Pode ser de outro serviço do servidor |
| `docker`, `containerd` ou `tailscaled` não está `enabled` | **No servidor**: `sudo systemctl enable <serviço>` e repita o passo 4 |
| `VOLTOU` acima de 600 s, ou não volta | Siga o "Se não voltar em 10 minutos" do passo 12 (CA2) da [primeira implantação](primeira-implantacao.md#ca2--reboot-sem-intervenção-em-até-10-minutos-qa-08-e-pv-2) e cole a saída no chat |
| `tailscale serve` vazio depois do reboot, com os containers `healthy` | A premissa PV-2 falhou; o SAD §9 já prevê a alternativa. Cole a saída no chat |
| `regime: uso somado` acima de 1024 MiB | Espere 5 minutos com o app sem uso e rode o script de novo; se continuar, cole no chat |

## 6. Cole a saída no chat

Só isto, nesta ordem:

1. A saída inteira do `sudo ./verificar.sh` **depois** do reboot (passo 4).
2. As duas linhas do cronômetro do PC (`caiu após ...` e `VOLTOU: ...`).
3. Dos dois `nmap`, as linhas a partir de `PORT STATE SERVICE`.

A saída tem IPs e o nome da tailnet. Pode ir para o chat, mas nunca para o repositório, um PR ou uma issue.
