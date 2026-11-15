import 'reflect-metadata';
import { carregarConfig } from './config/config.js';
import { criarDataSource } from './database/data-source.js';

/** Comandos de operação, executados dentro do container (SAD §6). */

const TAMANHO_MINIMO_DA_SENHA = 12;

/** Lê uma linha sem mostrar o que é digitado. Sem terminal (uso em script ou teste), lê da entrada padrão. */
function lerOculto(pergunta: string): Promise<string> {
  const entrada = process.stdin;
  return new Promise((resolve, reject) => {
    if (!entrada.isTTY) {
      let tudo = '';
      entrada.setEncoding('utf8');
      entrada.on('data', (parte: string) => (tudo += parte));
      entrada.on('end', () => resolve(tudo.split(/\r?\n/)[0] ?? ''));
      entrada.on('error', reject);
      return;
    }
    process.stdout.write(pergunta);
    let digitado = '';
    entrada.setRawMode(true);
    entrada.resume();
    entrada.setEncoding('utf8');
    const aoDigitar = (tecla: string) => {
      for (const c of tecla) {
        if (c === '\r' || c === '\n') {
          entrada.setRawMode(false);
          entrada.pause();
          entrada.off('data', aoDigitar);
          process.stdout.write('\n');
          return resolve(digitado);
        }
        if (c === '\u0003') {
          entrada.setRawMode(false);
          process.stdout.write('\n');
          return reject(new Error('Cancelado'));
        }
        if (c === '\u007f' || c === '\b') digitado = digitado.slice(0, -1);
        else digitado += c;
      }
    };
    entrada.on('data', aoDigitar);
  });
}

async function definirSenha(): Promise<void> {
  const interativo = process.stdin.isTTY;
  const senha = await lerOculto(`Nova senha (mínimo de ${TAMANHO_MINIMO_DA_SENHA} caracteres): `);
  if (senha.length < TAMANHO_MINIMO_DA_SENHA) {
    throw new Error(`A senha precisa ter pelo menos ${TAMANHO_MINIMO_DA_SENHA} caracteres`);
  }
  if (senha.length > 200) throw new Error('A senha pode ter no máximo 200 caracteres');
  if (interativo && (await lerOculto('Repita a senha: ')) !== senha) {
    throw new Error('As senhas não conferem');
  }

  const dataSource = await criarDataSource(carregarConfig()).initialize();
  try {
    // crypt() + gen_salt('bf'): o banco guarda só o hash (HU-01 CA3).
    await dataSource.query(
      `INSERT INTO usuario (nome, senha_hash) VALUES ('matheus', crypt($1, gen_salt('bf', 12)))
       ON CONFLICT (nome) DO UPDATE SET senha_hash = EXCLUDED.senha_hash, atualizado_em = now()`,
      [senha],
    );
    // Trocar a senha encerra todas as sessões abertas.
    await dataSource.query(`DELETE FROM sessao`);
  } finally {
    await dataSource.destroy();
  }
  console.log('Senha definida. As sessões abertas foram encerradas.');
}

const comandos: Record<string, () => Promise<void>> = {
  'definir-senha': definirSenha,
  'criar-token-mcp': async () => {
    throw new Error('Disponível a partir da v0.2.0 (marco de 30/11, SAD DT-21)');
  },
  'revogar-token-mcp': async () => {
    throw new Error('Disponível a partir da v0.2.0 (marco de 30/11, SAD DT-21)');
  },
};

const comando = comandos[process.argv[2] ?? ''];
if (!comando) {
  console.error(`Uso: node apps/api/dist/cli.js <comando>\nComandos: ${Object.keys(comandos).join(', ')}`);
  process.exit(2);
}
try {
  await comando();
} catch (erro) {
  console.error(`Erro: ${(erro as Error).message}`);
  process.exit(1);
}
