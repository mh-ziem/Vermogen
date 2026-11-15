# Atualização do Vermögen no ziem-homeserver

> Roteiro de toda atualização de versão, a partir da `v0.2.0` (marco de 30/11). Base: SAD DT-15 e DT-17.
> Quem executa: só o Matheus (PRD R6). Cada bloco diz **onde** rodar: no **servidor** (pelo `ssh`) ou no **PC** (no WSL).
> Pré-requisito: a primeira implantação feita (`docs/operacao/primeira-implantacao.md`).

## Como ler

- Os trechos entre `< >` você troca na hora de digitar: `<acesso-ssh>` é o mesmo destino que você usa no `ssh`; `<versão>` é a versão nova, sem o "v" (ex.: `0.2.0`).
- Tempo estimado: 10 minutos.
- A atualização é feita pelo script `deploy/atualizar.sh`, que fica em `/srv/vermogen/atualizar.sh`. Ele:
  1. baixa a imagem nova (se a versão não existir, para sem mexer em nada);
  2. para o app, para nada ser gravado depois do dump;
  3. faz o dump do banco em `/srv/vermogen/backups/`, com a data e a versão anterior no nome, e mantém só os 5 mais recentes;
  4. troca a versão no `.env` e sobe o app novo (as migrações rodam nessa hora, DT-17);
  5. espera o app ficar `healthy` (até 5 minutos) e confere se o `/api/health` devolve a versão nova.
- Se algo falhar depois do dump, o script para, **não apaga o dump** e imprime os comandos para voltar, já com a versão e o nome do arquivo certos. Eles são os mesmos da seção "Como voltar".

## 0. Antes de começar

- [ ] O PR da versão nova está no `main`, com o aviso "contém migração" lido.
- [ ] A tag `v<versão>` foi criada no `main` e o workflow **Imagem** terminou verde (aba Actions).
- [ ] Ninguém está usando o app agora: ele fica fora do ar por cerca de 1 minuto.

## 1. Copiar os arquivos da versão nova

Copie o script e o `compose.yml` da tag. O `compose.yml` pode ter mudado entre versões; o script não muda nada no seu `.env` além da versão.

**No PC (WSL):**

```bash
cd ~/codes/Vermogen
git fetch origin --tags
git show v<versão>:deploy/atualizar.sh > /tmp/vermogen-atualizar.sh
git show v<versão>:deploy/compose.yml  > /tmp/vermogen-compose.yml
scp /tmp/vermogen-atualizar.sh <acesso-ssh>:/srv/vermogen/atualizar.sh
scp /tmp/vermogen-compose.yml  <acesso-ssh>:/srv/vermogen/compose.yml.novo
rm /tmp/vermogen-atualizar.sh /tmp/vermogen-compose.yml
```

**No servidor:**

```bash
cd /srv/vermogen
chmod 700 atualizar.sh
diff compose.yml compose.yml.novo && echo "compose sem mudança"
```

- Se aparecer `compose sem mudança`: `rm compose.yml.novo`.
- Se aparecer diferença: cole no chat antes de seguir. Se a mudança vier anunciada no PR da versão, troque o arquivo:

  ```bash
  cd /srv/vermogen
  cp compose.yml compose.yml.anterior
  mv compose.yml.novo compose.yml
  docker compose config -q && echo "compose OK"
  ```

## 2. Atualizar

**No servidor:**

```bash
cd /srv/vermogen
./atualizar.sh <versão>
```

Esperado no fim:

```
==> App healthy em ...s
==> Atualizado para <versão>. Dump de antes: /srv/vermogen/backups/vermogen_<data>_v<versão-anterior>.dump
```

Confira no navegador: abra o app, entre, veja se as telas carregam. Se estiver tudo bem:

```bash
rm /srv/vermogen/.env.antes-da-atualizacao
ls -lh /srv/vermogen/backups
```

O `ls` mostra no máximo 5 dumps, do mais antigo ao mais novo.

### Mensagens de erro que param antes de mexer em algo

| Mensagem | O que fazer |
|---|---|
| `informe a versão nova no formato X.Y.Z` | Rode de novo sem o "v": `./atualizar.sh 0.2.0` |
| `o .env já está na versão ...` | Nada a fazer: já está atualizado |
| `o banco (vermogen-db) não está healthy` | `docker compose ps` e `docker compose logs --tail 50 vermogen-db`; cole no chat |
| `não consegui baixar a versão ...` | Confira a tag no GitHub e o login no GHCR (`docker login ghcr.io`, passo 5 da primeira implantação) |
| `o pg_dump falhou` | O app foi religado na versão anterior. Cole a saída no chat |

### Só na 0.2.0 (opcional): cadastrar a configuração inicial

A 0.2.0 traz um comando que cadastra as 9 contas da configuração inicial (PRD §9.4). Ele só age se o cadastro estiver vazio; se você já cadastrou alguma coisa pela tela, não faz nada.

**No servidor:**

```bash
cd /srv/vermogen
docker compose exec vermogen-app node apps/api/dist/cli.js cadastrar-configuracao-inicial
```

Depois confira as contas na tela **Contas**.

## 3. Medir a memória (QA-12)

Use o app por alguns minutos (entre, navegue pelas telas, cadastre algo). Depois:

**No servidor:**

```bash
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.CPUPerc}}' vermogen-app vermogen-db
for c in vermogen-app vermogen-db; do
  echo "$c pico desde a subida: $(( $(docker exec "$c" cat /sys/fs/cgroup/memory.peak) / 1048576 )) MiB"
done
```

Cole a saída no chat. A primeira tabela é o uso agora; as duas últimas linhas são o maior uso desde que cada container subiu (o limite de cada um é 512 MiB). Se o `memory.peak` der erro, cole só a tabela.

## 4. Como voltar

Use quando a versão nova não subir ou estiver com defeito. Volta o app **e o banco** para o estado de antes da atualização: o que foi gravado depois do dump se perde.

**No servidor.** Troque `<versão-anterior>` e `<arquivo-do-dump>` pelos valores que o script imprimiu (ou veja com `ls -t /srv/vermogen/backups | head -1`):

```bash
cd /srv/vermogen
docker compose logs --tail 100 vermogen-app > /tmp/vermogen-erro.log   # para colar no chat
docker compose stop vermogen-app
sed -i 's/^VERMOGEN_VERSION=.*/VERMOGEN_VERSION=<versão-anterior>/' .env
```

Restaurar o banco, passo a passo:

1. Apagar o banco atual (que pode estar com migrações pela metade). O app está parado, então ninguém está conectado:

   ```bash
   docker compose exec -T vermogen-db dropdb -U vermogen --force vermogen
   ```

2. Criar o banco vazio de novo:

   ```bash
   docker compose exec -T vermogen-db createdb -U vermogen vermogen
   ```

3. Carregar o dump. `--single-transaction` faz tudo ou nada; `--exit-on-error` para no primeiro erro:

   ```bash
   docker compose exec -T vermogen-db pg_restore -U vermogen -d vermogen --exit-on-error --single-transaction < backups/<arquivo-do-dump>
   ```

   Sem mensagem = deu certo. Se aparecer erro, não continue: cole no chat.

4. Subir a versão anterior:

   ```bash
   docker compose up -d
   docker compose ps
   PORTA=$(grep '^VERMOGEN_PORT=' .env | cut -d= -f2)
   curl -s "http://127.0.0.1:$PORTA/api/health"; echo
   ```

   Esperado: os dois `(healthy)` e `{"status":"ok","versao":"<versão-anterior>"}`. A senha de login e os tokens do MCP voltam a ser os de antes da atualização.

Se você trocou o `compose.yml` no passo 1, volte também o arquivo: `mv compose.yml.anterior compose.yml` antes do `docker compose up -d`.

### Restaurar um dump mais antigo

Mesmo caminho, com o arquivo escolhido no passo 3 e, no `.env`, a versão que aparece no nome dele (`..._v<versão>.dump`). O dump guarda o banco **da versão do nome**; restaurá-lo com outra versão do app pode falhar nas migrações.
