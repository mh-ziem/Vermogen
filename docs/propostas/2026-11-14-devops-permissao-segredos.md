# Proposta: dono e permissão dos arquivos de segredo

| Campo | Valor |
|---|---|
| Origem | DevOps |
| Data | 2026-11-14 |
| Status | aceita |
| Urgência | Não bloqueia: o compose e o roteiro já usam o valor proposto. Ajuste de texto no SAD (DT-16) |

## O que muda

Na DT-16, a linha da árvore de `/srv/vermogen/`:

```
├── secrets/         db_password, pgcrypto_key (permissão 600)
```

passa a ser:

```
├── secrets/         db_password (dono 999:1000, 0440), pgcrypto_key (dono 1000:1000, 0400); pasta root 0700
```

E a DT-18 ganha uma frase: "Dono e permissão de cada arquivo seguem o roteiro de primeira implantação (`docs/operacao/primeira-implantacao.md`, passo 4)."

## Por quê

- Fora do Swarm, o Docker Compose entrega o arquivo de segredo ao container como um bind mount: dentro do container ele tem o mesmo dono e a mesma permissão que tem no servidor. Os campos `uid`, `gid` e `mode` de `secrets:` não valem nesse modo.
- A `db_password` é lida por dois usuários diferentes: o PostgreSQL (uid 999 na imagem oficial Debian, que a lê a cada subida por `POSTGRES_PASSWORD_FILE`) e o app (uid 1000, SAD §6). Com `600`, um dos dois fica sem acesso e o container não sobe. Com dono 999, grupo 1000 e `0440`, os dois leem e ninguém mais.
- A `pgcrypto_key` só é usada pelo app. `0400` com dono 1000 é mais restrito que `600` (nem o app consegue alterá-la), e o banco nem recebe esse arquivo no compose.
- Testado localmente com o `deploy/compose.yml` e a imagem montada do esqueleto: os dois containers ficaram `healthy` com essas permissões.

## Impacto

- HU: nenhum. Prazo: nenhum. Métricas: nenhuma (QA-03 continua atendido: os segredos seguem fora do repositório e da imagem).
- Contrato (SAD §6): nenhum. Muda só o texto da DT-16 (e uma frase na DT-18), que hoje diz "permissão 600".
- Arquivos do DevOps que já seguem a proposta: `deploy/compose.yml` (PR #2) e `docs/operacao/primeira-implantacao.md` (PR #6).

## Alternativa se recusada

Manter `600` exigiria que app e banco rodassem com o mesmo uid ou que cada um recebesse uma cópia própria da senha (dois arquivos com o mesmo valor, que podem divergir). As duas opções são piores que a proposta; nesse caso o DevOps ajustaria o compose e o roteiro para a opção escolhida.

## Resposta

**Aceita** pelo chat de Arquitetura e Desenvolvimento em 14/11/2026.

- Motivo: o diagnóstico está certo (fora do Swarm, `uid`, `gid` e `mode` de `secrets:` não se aplicam), e a proposta é mais restrita que o `600` para a `pgcrypto_key`.
- Alteração: SAD 1.1, DT-16 (árvore de pastas) e DT-18 (tabela de dono e permissão por arquivo), no PR do esqueleto (`dev/esqueleto`).
- Este arquivo entra no `main` pelo mesmo PR; o PR original da proposta pode ser fechado sem merge.
