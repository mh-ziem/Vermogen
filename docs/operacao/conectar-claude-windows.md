# Conectar o app do Claude no Windows ao MCP do Vermögen

> Roteiro do marco de 30/11 (versão `v0.2.0`). Base: SAD DT-11, DT-12 e DT-13. Valida a premissa **PV-1** (SAD §9): o app do Claude no Windows alcança o MCP pela ponte local.
> Quem executa: só o Matheus. Cada bloco diz **onde** rodar: no **servidor** (pelo `ssh`), no **PowerShell** do Windows ou no **WSL**.

## Como funciona

O app do Claude não fala direto com o servidor. Ele liga um programa pequeno no próprio PC, o `mcp-remote`, e esse programa repassa as chamadas para `https://<nome>.<tailnet>.ts.net/mcp` pela tailnet, com o token no cabeçalho `Authorization: Bearer ...` (SAD DT-12). Motivo: os conectores remotos do app do Claude partem da nuvem da Anthropic e não alcançam a tailnet.

Os trechos entre `< >` você troca na hora de digitar: `<nome>.<tailnet>.ts.net` é o endereço do app (o mesmo do `VERMOGEN_PUBLIC_URL`).

Tempo estimado: 20 minutos.

## 0. Antes de começar

- [ ] A `v0.2.0` está implantada (`docs/operacao/atualizacao.md`), e `https://<nome>.<tailnet>.ts.net` abre no navegador do PC.
- [ ] O Tailscale do Windows está conectado.
- [ ] O app do Claude para Windows está atualizado.
- [ ] O Node.js está instalado **no Windows** (não basta no WSL). No **PowerShell**:

  ```powershell
  node --version
  npx --version
  ```

  Recomendado: Node 24 LTS (o mesmo do projeto), instalado de nodejs.org. O `mcp-remote` pede Node 18 ou superior, e as dependências dele pedem 20 ou superior. Se o comando não existir, instale, **feche e abra a sessão do Windows** e confira de novo. O app do Claude usa o Node do sistema.

## 1. Gerar o token no servidor

**No servidor:**

```bash
cd /srv/vermogen
docker compose exec vermogen-app node apps/api/dist/cli.js criar-token-mcp --nome claude-desktop-pc
```

O comando imprime **uma vez** uma linha que começa com `vmg_`. Esse é o token, válido por 6 meses (DT-11).

1. Copie a linha inteira para o seu gerenciador de senhas (item "Vermögen – token MCP claude-desktop-pc", com a data de hoje). Anote no calendário a troca daqui a 6 meses.
2. Limpe a tela: `clear`.

O token não fica gravado em arquivo no servidor, só o hash dele no banco. Se você perdê-lo, gere outro e revogue o antigo (seção 6).

## 2. Testar o MCP antes de mexer no app do Claude

Assim, se algo falhar depois, você já sabe que o servidor e o token estão bons.

**No WSL** (o `read -rs` pede o token sem mostrar e sem gravar no histórico; cole e aperte **Enter**):

```bash
URL=https://<nome>.<tailnet>.ts.net
read -rs -p "Token: " TOKEN; echo

# Sem token: esperado 401
curl -s -o /dev/null -w 'sem token: %{http_code}\n' -X POST "$URL/mcp" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Com token: esperado 200 e uma resposta com "serverInfo"
curl -s -X POST "$URL/mcp" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"teste-manual","version":"0"}}}'
echo

# GET não é aceito (servidor sem estado): esperado 405
curl -s -o /dev/null -w 'GET: %{http_code}\n' -H "Authorization: Bearer $TOKEN" "$URL/mcp"

unset TOKEN
```

A resposta com token vem em JSON, começando com `{"jsonrpc":"2.0","id":1,"result":{...`. Se der `401` com o token, ele foi copiado errado: refaça o passo 1.

## 3. Guardar o token num arquivo só seu

O token não vai no arquivo de configuração do app do Claude. Ele fica num arquivo de cabeçalho que o `mcp-remote` lê (`--header-file`). Assim ele também não aparece na lista de processos do Windows.

Escolha a pasta:

- Se o seu nome de usuário do Windows **não tem espaço**, use `%USERPROFILE%\.vermogen`.
- Se **tem espaço**, use `C:\vermogen-mcp`. O app do Claude para Windows tem um defeito conhecido com espaços nos argumentos.

**No PowerShell** (exemplo com `%USERPROFILE%\.vermogen`; se for o outro caso, troque `$pasta`):

```powershell
$pasta = "$env:USERPROFILE\.vermogen"
New-Item -ItemType Directory -Force $pasta | Out-Null
notepad "$pasta\mcp-headers.txt"
```

O Bloco de Notas pergunta se quer criar o arquivo: **Sim**. Escreva uma linha só, colando o token no lugar do marcador (o token não passa pelo histórico do PowerShell, porque você cola no Bloco de Notas):

```
Authorization: Bearer <cole-o-token-aqui>
```

Salve com codificação **UTF-8**, não "UTF-8 com BOM" (fica em **Salvar como → Codificação**). O BOM é um caractere invisível no começo do arquivo que estraga o nome do cabeçalho; esse efeito está a confirmar, mas não custa evitar. Feche o Bloco de Notas.

Deixe o arquivo legível só por você:

```powershell
$arquivo = "$pasta\mcp-headers.txt"
icacls $arquivo /inheritance:r /grant:r "$($env:USERNAME):(R,W)"
icacls $arquivo
```

Esperado: uma linha só, com o seu usuário.

## 4. Configurar o app do Claude

1. Abra o app do Claude → **Settings** (Configurações) → **Developer** → **Edit Config**. Isso abre (ou cria) o `claude_desktop_config.json` na pasta certa. Pela documentação, o arquivo fica em `%APPDATA%\Claude\claude_desktop_config.json`; em instalações pela Microsoft Store, ele pode estar em outra pasta (a confirmar). Por isso, use o botão.
2. Se o arquivo estiver vazio ou só com `{}`, deixe assim. Se já tiver `"mcpServers"`, acrescente só o bloco `"vermogen"` dentro dele.

```json
{
  "mcpServers": {
    "vermogen": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote@0.15.2",
        "https://<nome>.<tailnet>.ts.net/mcp",
        "--transport",
        "http-only",
        "--header-file",
        "C:\\Users\\<seu-usuario-do-windows>\\.vermogen\\mcp-headers.txt"
      ]
    }
  }
}
```

Cuidados:

- **Barras do caminho**: no JSON cada `\` vira `\\`. Se usou a outra pasta: `"C:\\vermogen-mcp\\mcp-headers.txt"`.
- **Versão fixa**: `mcp-remote@0.15.2` (publicada em 20/10/2026), nunca `@latest`, pela mesma regra das imagens. A troca de versão passa por um PR deste roteiro.
- **`--transport http-only`**: o servidor só fala o transporte HTTP do protocolo (sem SSE). Com isso, o `mcp-remote` não tenta outro.
- **Sem espaços** em nenhum item de `args`.

3. Salve e **feche o app do Claude por completo**: clique com o botão direito no ícone perto do relógio → **Quit**. Fechar a janela não basta. Abra de novo.

Na primeira vez, o `npx` baixa o `mcp-remote`, o que leva alguns segundos.

## 5. Testar com a ferramenta `ping` (PV-1)

1. Numa conversa nova, clique no **+** da caixa de mensagem → **Connectors** e confira que `vermogen` aparece ligado, com a ferramenta `ping`.
2. Escreva: **"Chame a ferramenta ping do Vermögen e me mostre a resposta."**
3. Aprove a chamada quando o app pedir.

Esperado: o Claude mostra `{"status":"ok","versao":"0.2.0"}`.

**Cole o resultado no chat**: isso confirma a premissa PV-1. Se não funcionar depois da seção abaixo, avise também, porque o SAD manda rever o transporte do MCP antes de construir a importação.

## 6. Se o `ping` falhar

Primeiro, veja o log do conector. **No PowerShell:**

```powershell
Get-ChildItem "$env:APPDATA\Claude\logs"
Get-Content "$env:APPDATA\Claude\logs\mcp-server-vermogen.log" -Tail 50
Get-Content "$env:APPDATA\Claude\logs\mcp.log" -Tail 50
```

(se a pasta não existir, procure em `$env:LOCALAPPDATA\Claude\logs`; a confirmar)

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `vermogen` não aparece nos Connectors | JSON inválido ou o app não foi reiniciado | Confira vírgulas e `\\`; feche pelo ícone do relógio e abra de novo |
| `spawn npx ENOENT` ou `'npx' não é reconhecido` | Node não instalado no Windows ou fora do PATH | Instale o Node 24 LTS, saia e entre de novo no Windows. Se continuar, troque `"command": "npx"` por `"command": "cmd"` e ponha `"/c", "npx",` no começo de `args` (a confirmar) |
| Erro com `${APPDATA}` no caminho | Defeito conhecido do app no Windows | Acrescente ao bloco `"vermogen"`: `"env": { "APPDATA": "C:\\Users\\<seu-usuario-do-windows>\\AppData\\Roaming\\" }` |
| `ENOTFOUND` ou `getaddrinfo` | O Windows não resolve o nome da tailnet | Tailscale do Windows conectado? MagicDNS ligado? Teste `https://<nome>.<tailnet>.ts.net` no navegador |
| `401` no log, ou **abre o navegador numa página de login/OAuth** | Token errado, vencido ou revogado, ou o arquivo de cabeçalho não foi lido | Feche o navegador. Confira o caminho no `--header-file`, o texto `Authorization: Bearer vmg_...` e a codificação UTF-8. Ao receber 401, o `mcp-remote` tenta um login OAuth que o Vermögen não tem. Apague a pasta `%USERPROFILE%\.mcp-auth` e reinicie o app |
| `ENOENT` citando `mcp-headers.txt` | Caminho do arquivo errado | Confira o caminho e as barras `\\` |
| `405` | URL ou transporte errados | A URL termina em `/mcp`? Tem `--transport http-only`? |
| Erro de certificado | Raro: o certificado do `ts.net` é público (Let's Encrypt) | Se você usa VPN de empresa no PC, ela pode interceptar o HTTPS; teste sem a VPN |

Teste manual do conector, fora do app do Claude. **No PowerShell** (troque o caminho e o endereço):

```powershell
npx -y mcp-remote@0.15.2 https://<nome>.<tailnet>.ts.net/mcp --transport http-only --header-file "C:\Users\<seu-usuario-do-windows>\.vermogen\mcp-headers.txt" --debug
```

Ele fica esperando. As mensagens dizem se conectou ou o erro. Ao conectar, o `mcp-remote` também procura endereços de OAuth (`/.well-known/...`); no Vermögen eles não existem, e isso é normal. Saia com **Ctrl+C**. Com `--debug`, o detalhe fica em `%USERPROFILE%\.mcp-auth\`. Cole a saída no chat; ela não mostra o token.

Plano B, se o `--header-file` não funcionar: passar o cabeçalho por variável de ambiente no próprio `claude_desktop_config.json`, como a documentação do `mcp-remote` mostra para o Windows (`"--header", "Authorization:${AUTH_HEADER}"` e `"env": { "AUTH_HEADER": "Bearer vmg_..." }`, sem espaço depois dos dois-pontos). Nesse caso o token fica escrito no arquivo de configuração. Use só se o chat confirmar.

## 7. Revogar ou trocar o token

**No servidor**, para ver os tokens (id, nome, validade, último uso, revogado):

```bash
cd /srv/vermogen
docker compose exec vermogen-app node apps/api/dist/cli.js listar-tokens-mcp
```

Para revogar (troque `<id>` pelo id da lista):

```bash
docker compose exec vermogen-app node apps/api/dist/cli.js revogar-token-mcp <id>
```

Depois disso, qualquer chamada com esse token recebe 401 na hora.

- **Trocar** (a cada 6 meses ou se o token vazar): gere um novo (passo 1), troque a linha no `mcp-headers.txt` (passo 3), reinicie o app do Claude, teste o `ping` (passo 5) e só então revogue o antigo.
- **Desligar de vez**: revogue o token, apague o `mcp-headers.txt` e remova o bloco `"vermogen"` do `claude_desktop_config.json`.
