// Deixa em node_modules só o que o app (@vermogen/api) usa em produção.
//
// Por que existe: com npm workspaces, "npm ci --omit=dev" ainda instala pacotes de
// desenvolvimento (ex.: typescript e vite, que entram como "peer opcional" de pacotes
// do apps/web) e as dependências do apps/web, que em produção é só arquivos estáticos.
//
// Como funciona: lê o package-lock.json, parte das dependências de produção de apps/api,
// segue a árvore com a mesma regra de busca do Node (node_modules mais próximo, subindo)
// e apaga de node_modules tudo que não foi alcançado.
//
// Uso (na etapa "deps" do deploy/Dockerfile, dentro de /app, depois do npm ci):
//   node podar-dependencias.mjs
import { existsSync, readFileSync, rmSync } from 'node:fs';

const WORKSPACE = 'apps/api';
const pacotes = JSON.parse(readFileSync('package-lock.json', 'utf8')).packages;

if (!pacotes[WORKSPACE]) {
  console.error(`podar-dependencias: "${WORKSPACE}" não está no package-lock.json`);
  process.exit(1);
}

// Onde o Node acharia "nome" a partir do pacote instalado em "origem".
// Ex.: a partir de "node_modules/a/node_modules/b" tenta
// "node_modules/a/node_modules/b/node_modules/<nome>", "node_modules/a/node_modules/<nome>"
// e "node_modules/<nome>"; a partir de "apps/api", "apps/api/node_modules/<nome>" e a raiz.
function resolver(nome, origem) {
  let dir = origem;
  for (;;) {
    const candidato = dir ? `${dir}/node_modules/${nome}` : `node_modules/${nome}`;
    if (pacotes[candidato]) return candidato;
    if (dir === '') return null;
    const i = dir.lastIndexOf('/node_modules/');
    dir = i >= 0 ? dir.slice(0, i) : '';
  }
}

function dependenciasDe(chave) {
  const p = pacotes[chave];
  const opcionaisPeer = p.peerDependenciesMeta ?? {};
  return [
    ...Object.keys(p.dependencies ?? {}),
    ...Object.keys(p.optionalDependencies ?? {}),
    ...Object.keys(p.peerDependencies ?? {}).filter((n) => !opcionaisPeer[n]?.optional),
  ];
}

const alcancados = new Set([WORKSPACE]);
const fila = [WORKSPACE];
while (fila.length) {
  const atual = fila.pop();
  for (const nome of dependenciasDe(atual)) {
    let alvo = resolver(nome, atual);
    if (!alvo) continue; // opcional de outra plataforma: não está instalado
    if (pacotes[alvo].link) alvo = pacotes[alvo].resolved;
    if (!alcancados.has(alvo)) {
      alcancados.add(alvo);
      fila.push(alvo);
    }
  }
}

let removidos = 0;
for (const chave of Object.keys(pacotes)) {
  if (!chave.includes('node_modules/') || alcancados.has(chave)) continue;
  if (chave === `node_modules/@vermogen/api`) continue; // link do próprio workspace
  if (existsSync(chave)) {
    rmSync(chave, { recursive: true, force: true });
    removidos++;
  }
}
rmSync('node_modules/.bin', { recursive: true, force: true });
rmSync('node_modules/.package-lock.json', { force: true });

console.log(`podar-dependencias: ${alcancados.size - 1} pacotes mantidos, ${removidos} removidos`);
