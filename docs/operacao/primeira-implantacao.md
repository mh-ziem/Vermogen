# Primeira implantação do Vermögen no ziem-homeserver

> Roteiro da HU-02 (marco de 16/11, versão `v0.1.0`). Base: SAD DT-15 a DT-18, DT-16b e §6.
> Quem executa: só o Matheus (PRD R6). Cada bloco diz **onde** rodar: no **servidor** (pelo `ssh`) ou no **PC** (no WSL).

## Como ler

- Os trechos entre `< >` são para trocar pelo valor real **na hora de digitar**. Eles não ficam escritos aqui porque o repositório é público:

  | Marcador | O que é |
  |---|---|
  | `<acesso-ssh>` | O mesmo destino que você usa no `ssh` para entrar no servidor |
  | `<porta>` | A porta do host escolhida no passo 2 |
  | `<nome>.<tailnet>.ts.net` | O nome do servidor na tailnet (passo 7) |
  | `<ip-da-lan-do-servidor>`, `<ip-da-tailnet-do-servidor>` | Os IPs do servidor (passo 12) |

- Ao fim dos passos 1 e 12, cole a saída no chat para leitura.
- Tempo estimado: 40 a 60 minutos, contando o teste de reboot.

## 0. Antes de começar

- [ ] Os PRs `ops: compose`, `ops: pipeline`, `ops: Dockerfile` e o esqueleto do app estão no `main`.
- [ ] A tag `v0.1.0` foi criada no `main` e o workflow **Imagem** terminou verde no GitHub (aba Actions).
- [ ] O pacote `vermogen` está **privado** (DT-15): abra github.com → seu perfil → **Packages** → `vermogen` → **Package settings** e confira a visibilidade em "Danger Zone". Se estiver público, mude para privado.

## 1. Levantar o ambiente

**No servidor:**

```bash
cat /srv/REGISTRY.md
free -h
nproc
df -h /srv
docker --version
docker compose version
tailscale version
tailscale serve status
systemctl is-enabled docker containerd tailscaled
getent passwd 999 1000
```

O que conferir (ou cole a saída no chat):

| Item | Esperado | Por quê |
|---|---|---|
| `REGISTRY.md` | Mostra as portas já usadas. Se não existir, tudo bem: o passo 11 cria | Escolher a porta |
| `free -h` | Pelo menos 2 GiB livres | A stack tem limite de 1 GiB no total |
| `docker --version` | 25 ou maior | O compose usa `start_interval` no healthcheck |
| `docker compose version` | 2.20 ou maior | Sintaxe do `compose.yml` |
| `tailscale version` | 1.52 ou maior | Sintaxe `tailscale serve --bg` |
| `tailscale serve status` | "No serve config", ou a lista do que já está publicado | Saber se a porta 443 da tailnet já está em uso |
| `systemctl is-enabled ...` | `enabled` nas três linhas | Tudo volta sozinho no boot (QA-08) |
| `getent passwd 999 1000` | Mostra quem são os usuários 999 e 1000 no servidor (pode não mostrar o 999) | Explicado no passo 4 |

## 2. Escolher a porta

Escolha uma porta que não apareça no `REGISTRY.md` (sugestão: algo na faixa 8000–8999). Confira que ninguém está ouvindo nela:

**No servidor** (troque `<porta>`):

```bash
sudo ss -tlnp | grep ':<porta> ' || echo "porta livre"
```

Esperado: `porta livre`.

## 3. Criar as pastas

**No servidor:**

```bash
sudo install -d -m 750 -o "$USER" -g "$USER" /srv/vermogen
sudo install -d -m 700 -o root -g root /srv/vermogen/secrets
sudo install -d -m 700 -o "$USER" -g "$USER" /srv/vermogen/backups
ls -la /srv/vermogen
```

- `/srv/vermogen` é sua: o `scp` do passo 6 grava ali sem `sudo`.
- `secrets/` é do root e ninguém mais entra. Os containers recebem cada arquivo direto pelo Docker, sem precisar abrir a pasta.
- `backups/` recebe os dumps feitos antes de cada migração (DT-17; roteiro de atualização, marco de 30/11).

## 4. Criar os dois segredos

Os valores são sorteados direto para dentro do arquivo: você não digita nada, então nada vai para o histórico do shell.

**No servidor:**

```bash
sudo sh -c 'umask 077; tr -dc "A-Za-z0-9" < /dev/urandom | head -c 48 > /srv/vermogen/secrets/db_password'
sudo sh -c 'umask 077; tr -dc "A-Za-z0-9" < /dev/urandom | head -c 64 > /srv/vermogen/secrets/pgcrypto_key'

# Dono e permissão: veja a explicação abaixo
sudo chown 999:1000  /srv/vermogen/secrets/db_password
sudo chmod 0440      /srv/vermogen/secrets/db_password
sudo chown 1000:1000 /srv/vermogen/secrets/pgcrypto_key
sudo chmod 0400      /srv/vermogen/secrets/pgcrypto_key

sudo ls -ln /srv/vermogen/secrets
```

Esperado (tamanhos 48 e 64):

```
-r--r----- 1  999 1000 48 ... db_password
-r-------- 1 1000 1000 64 ... pgcrypto_key
```

**Por que esses números.** O Docker entrega o arquivo ao container com o mesmo dono e a mesma permissão que ele tem aqui no servidor. Dentro dos containers, o PostgreSQL roda como usuário 999 e o app como usuário 1000.

- `db_password`: os dois precisam ler. Dono 999 (banco), grupo 1000 (app), leitura para os dois e mais ninguém.
- `pgcrypto_key`: só o app precisa. Dono 1000, só leitura para ele. O banco nem recebe esse arquivo.
- No servidor, o uid 1000 provavelmente é o seu usuário (o `getent` do passo 1 mostra). Então você consegue ler os dois sem `sudo`, o que não muda nada: quem está no grupo `docker` já tem acesso de root. Se o 999 aparecer no `getent` como um usuário de sistema, ele também consegue ler a senha do banco; o risco é pequeno, porque o banco não tem porta publicada.

**Não recrie a `db_password` depois da primeira subida.** O banco grava a senha na primeira vez que sobe; um arquivo novo deixaria o app sem conseguir entrar.

### Guarde uma cópia da `pgcrypto_key` fora do servidor

> **Importante.** Sem essa chave, as anotações e justificativas gravadas no banco ficam ilegíveis para sempre (DT-18). O servidor tem disco único.

**No servidor:**

```bash
sudo cat /srv/vermogen/secrets/pgcrypto_key; echo
```

Copie o valor para o seu gerenciador de senhas (item "Vermögen – pgcrypto_key"), confira que colou inteiro (64 caracteres) e limpe a tela:

```bash
clear
```

A `db_password` não precisa de cópia: se for perdida, dá para trocá-la por dentro do banco.

## 5. Entrar no GHCR (uma vez só)

O pacote da imagem é privado. O servidor precisa de um token do GitHub que **só lê pacotes**.

**Gerar o token (no navegador):**

1. github.com → foto do perfil → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)**. O GHCR só aceita o token "classic".
2. Note: `ziem-homeserver: ler imagens do GHCR`.
3. Expiration: 1 ano (anote no calendário a data de troca).
4. Marque **somente** `read:packages`. Nenhuma outra caixa.
5. **Generate token** e copie o valor (ele aparece uma vez).

**No servidor:**

```bash
docker login ghcr.io -u mh-ziem --password-stdin
```

O comando fica esperando: cole o token, aperte **Enter** e depois **Ctrl+D**. Esperado: `Login Succeeded`. O token não aparece na tela nem no histórico.

```bash
chmod 600 ~/.docker/config.json
```

O Docker guarda o token nesse arquivo, só codificado (não criptografado); o `chmod` deixa só você ler.

> Se você usa `sudo docker` em vez de `docker`, faça o login também com `sudo` e use `sudo` em todos os comandos `docker` deste roteiro: o login fica guardado por usuário.

## 6. Copiar o `compose.yml` e o `.env`

Os arquivos saem da tag `v0.1.0`, sem trocar a branch do seu clone.

**No PC (WSL):**

```bash
cd ~/codes/Vermogen
git fetch origin --tags
git show v0.1.0:deploy/compose.yml           > /tmp/vermogen-compose.yml
git show v0.1.0:deploy/.env.servidor.example > /tmp/vermogen-env
scp /tmp/vermogen-compose.yml <acesso-ssh>:/srv/vermogen/compose.yml
scp /tmp/vermogen-env         <acesso-ssh>:/srv/vermogen/.env
rm /tmp/vermogen-compose.yml /tmp/vermogen-env
```

## 7. Preencher o `.env`

Descubra o nome do servidor na tailnet.

**No servidor:**

```bash
tailscale status --json | grep -m1 '"DNSName"'
```

A saída é parecida com `"DNSName": "<nome>.<tailnet>.ts.net.",`. Use esse nome **sem o ponto final**.

```bash
cd /srv/vermogen
chmod 600 .env
nano .env
```

Preencha assim (troque os marcadores), salve com **Ctrl+O**, **Enter**, e saia com **Ctrl+X**:

```
VERMOGEN_VERSION=0.1.0
VERMOGEN_PORT=<porta>
VERMOGEN_PUBLIC_URL=https://<nome>.<tailnet>.ts.net
VERMOGEN_LOG_LEVEL=info
```

Se o passo 1 mostrou que a porta 443 da tailnet já está em uso por outro app, veja a nota do passo 9 antes de seguir: o endereço muda.

Confira:

```bash
cd /srv/vermogen
docker compose config -q && echo "compose OK"
```

Esperado: `compose OK`. Se faltar algum valor, a mensagem diz qual (ex.: `defina VERMOGEN_PORT no .env`).

## 8. Subir

**No servidor:**

```bash
cd /srv/vermogen
docker compose pull
docker compose up -d
```

O `up` espera o banco ficar saudável antes de ligar o app; na primeira vez isso leva até 1 ou 2 minutos. Acompanhe até as duas linhas mostrarem `(healthy)`:

```bash
watch -n 5 docker compose ps
```

(saia com **Ctrl+C**)

Teste o app por dentro do servidor:

```bash
PORTA=$(grep '^VERMOGEN_PORT=' /srv/vermogen/.env | cut -d= -f2)
curl -s "http://127.0.0.1:$PORTA/api/health"; echo
```

Esperado: `{"status":"ok","versao":"0.1.0"}`.

Se algo ficar `unhealthy` ou reiniciando:

```bash
docker compose logs --tail 100 vermogen-db
docker compose logs --tail 100 vermogen-app
```

| Sintoma no log | Causa provável | O que fazer |
|---|---|---|
| `Permission denied` em `/run/secrets/...` | Dono ou permissão do segredo | Refaça os `chown`/`chmod` do passo 4 e `docker compose up -d` |
| `denied` ou `unauthorized` no `pull` | Login no GHCR | Refaça o passo 5 |
| `manifest unknown` no `pull` | Versão errada no `.env` | Confira `VERMOGEN_VERSION` (sem o `v`) |
| `password authentication failed` | `db_password` recriada depois da primeira subida | Avise o chat |
| App reinicia sozinho a cada 2 minutos | Não alcança o banco (o app tenta por 2 minutos e encerra; o Docker religa) ou uma migração falhou | Veja o log do app e do banco e cole no chat |

## 9. Publicar na tailnet com `tailscale serve` (HTTPS)

**Pré-requisito no painel do Tailscale (uma vez só, no navegador):** login.tailscale.com → **DNS**:

1. **MagicDNS**: habilitado.
2. **HTTPS Certificates**: clique em **Enable HTTPS**.

Efeito colateral já aceito na DT-16b: o nome `<nome>.<tailnet>.ts.net` passa a aparecer num registro público de certificados.

**No servidor:**

```bash
PORTA=$(grep '^VERMOGEN_PORT=' /srv/vermogen/.env | cut -d= -f2)
sudo tailscale serve --bg --https=443 "http://127.0.0.1:$PORTA"
tailscale serve status
```

- Se o comando mostrar um link dizendo que o Serve não está habilitado na tailnet, abra o link, aprove e rode o comando de novo.
- O `--bg` faz a configuração ficar gravada e voltar sozinha depois de um reboot (premissa PV-2, testada no passo 12).
- Esperado no `status` (formato exato a confirmar nesta primeira implantação): uma linha com `https://<nome>.<tailnet>.ts.net (tailnet only)` e, abaixo, `|-- / proxy http://127.0.0.1:<porta>`.

> **Se a porta 443 já for de outro app** (passo 1): use outra porta HTTPS, por exemplo `--https=8443`. Nesse caso, ponha a porta no `.env` (`VERMOGEN_PUBLIC_URL=https://<nome>.<tailnet>.ts.net:8443`), rode `cd /srv/vermogen && docker compose up -d` para o app pegar o endereço novo e use esse endereço no resto do roteiro.

**No PC ou no celular:** abra `https://<nome>.<tailnet>.ts.net`. O primeiro acesso pode levar alguns segundos (o certificado está sendo emitido). Deve aparecer a tela de login, com cadeado no navegador.

## 10. Criar a senha de login

**No servidor:**

```bash
cd /srv/vermogen
docker compose exec vermogen-app node apps/api/dist/cli.js definir-senha
```

O comando pede a senha sem mostrá-la enquanto você digita. Mínimo de 12 caracteres. **Não passe a senha como argumento na linha de comando**: ela iria para o histórico. Esperado: `Senha definida. As sessões abertas foram encerradas.`

Teste: entre no app pelo navegador com essa senha.

## 11. Registrar no `/srv/REGISTRY.md`

**No servidor.** Se o arquivo ainda não existe, crie com o cabeçalho:

```bash
test -f /srv/REGISTRY.md || printf '%s\n' \
  '# Registro de apps do ziem-homeserver' '' \
  '| App | Porta(s) | Pasta | Rede Docker | Motivo | Data |' \
  '|---|---|---|---|---|---|' | sudo tee /srv/REGISTRY.md > /dev/null
```

Acrescente a linha do Vermögen:

```bash
PORTA=$(grep '^VERMOGEN_PORT=' /srv/vermogen/.env | cut -d= -f2)
echo "| vermogen | 127.0.0.1:$PORTA (app); tailnet HTTPS 443 via tailscale serve | /srv/vermogen | vermogen_net | Vermögen: finanças pessoais (app NestJS + PostgreSQL 17, banco sem porta) | $(date +%F) |" \
  | sudo tee -a /srv/REGISTRY.md > /dev/null
cat /srv/REGISTRY.md
```

Se o arquivo já existia com outras colunas, edite com `sudo nano /srv/REGISTRY.md` e siga o formato dele. Se usou outra porta HTTPS no passo 9, corrija o "443".

## 12. Verificar os critérios de aceite da HU-02

### CA1 — portas só em `127.0.0.1` (QA-01)

**No servidor:**

```bash
PORTA=$(grep '^VERMOGEN_PORT=' /srv/vermogen/.env | cut -d= -f2)
docker ps --format 'table {{.Names}}\t{{.Ports}}'
sudo ss -tlnp | grep -E ":($PORTA|5432) " || echo "nada mais ouvindo"
hostname -I
```

Esperado:

- `vermogen-app` → `127.0.0.1:<porta>->3000/tcp`.
- `vermogen-db` → só `5432/tcp`, **sem seta** (não publicada no host).
- No `ss`, a porta do app aparece só como `127.0.0.1:<porta>`; a `5432` não aparece.
- O `hostname -I` mostra os IPs do servidor: o da LAN (`10.x`, `192.168.x`...) e o da tailnet (`100.x`). Use-os abaixo.

**Scan a partir de outra máquina da LAN** (o PC, no WSL, conectado à rede de casa):

```bash
sudo apt install -y nmap
nmap -Pn -sT -p- --open <ip-da-lan-do-servidor>
```

O scan de todas as portas leva alguns minutos. Esperado: **nem `<porta>`, nem `5432`, nem `443` aparecem**. A `22` (SSH) já existia e é esperada; qualquer outra porta deve estar no `REGISTRY.md` como de outro app.

Alternativa sem WSL, no PowerShell do Windows (resposta esperada: `TcpTestSucceeded : False`):

```powershell
Test-NetConnection <ip-da-lan-do-servidor> -Port <porta>
Test-NetConnection <ip-da-lan-do-servidor> -Port 5432
```

Pela tailnet, só a 443 deve responder:

```bash
nmap -Pn -sT -p <porta>,5432,443 <ip-da-tailnet-do-servidor>
```

Esperado: `443/tcp open`; `<porta>` e `5432` como `closed` ou `filtered`.

### 401 sem credencial (HU-01 CA1, QA-02)

**No PC (WSL):**

```bash
URL=https://<nome>.<tailnet>.ts.net
curl -s "$URL/api/health"; echo
curl -s -o /dev/null -w 'tela inicial: %{http_code}\n' "$URL/"
curl -s -o /dev/null -w 'sessão sem login: %{http_code}\n' "$URL/api/auth/sessao"
```

Esperado: `{"status":"ok","versao":"0.1.0"}`, `tela inicial: 200` e `sessão sem login: 401`. As únicas rotas públicas são a tela, `POST /api/auth/login` e `GET /api/health` (DT-11); qualquer outra rota da API responde 401 sem login.

### CA2 — reboot sem intervenção em até 10 minutos (QA-08 e PV-2)

1. **No PC (WSL)**, deixe rodando este cronômetro. Ele espera o app cair e depois mede até voltar:

   ```bash
   URL=https://<nome>.<tailnet>.ts.net
   inicio=$(date +%s)
   while curl -fs --max-time 5 -o /dev/null "$URL/api/health"; do sleep 2; done
   echo "caiu após $(( $(date +%s) - inicio )) s; esperando voltar..."
   until curl -fs --max-time 5 -o /dev/null "$URL/api/health"; do sleep 10; done
   echo "VOLTOU: $(( $(date +%s) - inicio )) s desde o reboot"
   ```

2. **No servidor**, reinicie:

   ```bash
   sudo reboot
   ```

3. Esperado no PC: `VOLTOU` com **menos de 600 s**. Anote o tempo.

4. Depois que voltar, **no servidor** (novo `ssh`):

   ```bash
   uptime
   cd /srv/vermogen && docker compose ps
   tailscale serve status
   ```

   Esperado: os dois containers `(healthy)` e o `tailscale serve` com a mesma configuração de antes, sem você ter rodado nada. Isso confirma a premissa PV-2.

Se não voltar em 10 minutos: entre pelo `ssh` e rode os três comandos acima mais `journalctl -b -u tailscaled --no-pager | tail -50`. Se os containers estão `healthy` e o `tailscale serve status` está vazio, a PV-2 falhou: cole a saída no chat (o SAD §9 já prevê a alternativa). Observação: um container parado com `docker compose stop` antes do reboot continua parado depois; é o comportamento do `unless-stopped`.

### CA3 — soma dos limites de memória ≤ 4 GiB (QA-12)

**No servidor:**

```bash
docker inspect -f '{{.Name}} memoria={{.HostConfig.Memory}} cpu={{.HostConfig.NanoCpus}}' vermogen-app vermogen-db
docker stats --no-stream vermogen-app vermogen-db
```

Esperado: `memoria=536870912` nas duas linhas (512 MiB cada; soma de 1 GiB, abaixo dos 4 GiB) e `cpu=1000000000` (1 CPU cada). O `docker stats` mostra o uso real agora; anote os números para a medição de memória do marco de 30/11.

### CA4 — comandos entregues prontos

Este roteiro. Se algum comando precisou de ajuste, conte no chat para corrigir o roteiro.

## 13. Como voltar atrás

**No servidor**, do mais leve ao mais drástico:

1. **Parar o app sem perder dados** (o banco fica no volume `vermogen_pgdata`):

   ```bash
   cd /srv/vermogen && docker compose down
   ```

   Para subir de novo: `docker compose up -d`.

2. **Tirar da tailnet** (desfaz só a configuração do Vermögen; use a mesma porta HTTPS do passo 9):

   ```bash
   sudo tailscale serve --https=443 off
   tailscale serve status
   ```

   Não use `tailscale serve reset` se outro app usa o `serve`: ele apaga tudo.

3. **Recomeçar do zero, apagando o banco** (só nesta primeira implantação, enquanto não há dado real):

   ```bash
   cd /srv/vermogen && docker compose down
   docker volume rm vermogen_pgdata
   ```

   Depois disso, e só depois, pode recriar a `db_password` (passo 4) e subir de novo (passo 8).

4. **Remover tudo**: os passos 2 e 3, e então:

   ```bash
   docker image rm $(docker image ls -q ghcr.io/mh-ziem/vermogen) postgres:17.12-trixie
   sudo rm -rf /srv/vermogen
   docker logout ghcr.io
   sudo nano /srv/REGISTRY.md   # apague a linha do vermogen
   ```

   No GitHub, revogue o token do passo 5 (Settings → Developer settings → Tokens (classic) → Delete).
