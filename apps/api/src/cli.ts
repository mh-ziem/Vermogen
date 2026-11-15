import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { Escrita } from './auditoria/escrita.js';
import { CadastrosService } from './cadastros/cadastros.service.js';
import { cadastrarConfiguracaoInicial } from './cadastros/configuracao-inicial.js';
import { CiclosService } from './calendario/ciclos.service.js';
import { carregarConfig } from './config/config.js';
import { criarDataSource } from './database/data-source.js';
import { TokensService } from './mcp/tokens.service.js';

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

async function comBanco<T>(trabalho: (db: DataSource) => Promise<T>): Promise<T> {
  const db = await criarDataSource(carregarConfig()).initialize();
  try {
    return await trabalho(db);
  } finally {
    await db.destroy();
  }
}

/** Lê `--nome <valor>` dos argumentos. */
function opcao(args: string[], nome: string): string | undefined {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function criarTokenMcp(args: string[]): Promise<void> {
  const nome = opcao(args, 'nome')?.trim();
  if (!nome) throw new Error('Informe um nome para identificar o token: criar-token-mcp --nome "Claude no PC"');
  const { id, token, expiraEm } = await comBanco((db) => new TokensService(db).criar(nome));
  console.error(`Token criado: id ${id}, válido até ${expiraEm.slice(0, 10)}.`);
  console.error('Guarde-o agora: ele não é mostrado de novo. Linha seguinte:');
  console.log(token);
}

async function revogarTokenMcp(args: string[]): Promise<void> {
  const id = args[0];
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Informe o id do token (veja listar-tokens-mcp)');
  const revogado = await comBanco((db) => new TokensService(db).revogar(id));
  if (!revogado) throw new Error('Token não encontrado ou já revogado');
  console.log('Token revogado. O Claude perde o acesso na próxima chamada.');
}

async function listarTokensMcp(): Promise<void> {
  const tokens = await comBanco((db) => new TokensService(db).listar());
  if (tokens.length === 0) return console.log('Nenhum token criado.');
  const data = (v: string | Date | null) => (v ? new Date(v).toISOString().slice(0, 16).replace('T', ' ') : '—');
  for (const t of tokens) {
    const situacao = t.revogadoEm ? 'revogado' : new Date(t.expiraEm) < new Date() ? 'expirado' : 'ativo';
    console.log(`${t.id}  ${situacao.padEnd(8)}  vence ${data(t.expiraEm)}  último uso ${data(t.ultimoUsoEm)}  ${t.nome}`);
  }
}

async function configuracaoInicial(): Promise<void> {
  const contas = await comBanco((db) => {
    const escrita = new Escrita(db);
    return cadastrarConfiguracaoInicial(new CadastrosService(db, escrita, new CiclosService(db, escrita)));
  });
  console.log(`Configuração inicial cadastrada: 5 instituições e ${contas} contas (PRD §9.4). Tudo pode ser editado no app.`);
}

const comandos: Record<string, (args: string[]) => Promise<void>> = {
  'definir-senha': definirSenha,
  'criar-token-mcp': criarTokenMcp,
  'revogar-token-mcp': revogarTokenMcp,
  'listar-tokens-mcp': listarTokensMcp,
  'cadastrar-configuracao-inicial': configuracaoInicial,
};

const comando = comandos[process.argv[2] ?? ''];
if (!comando) {
  console.error(`Uso: node apps/api/dist/cli.js <comando>\nComandos: ${Object.keys(comandos).join(', ')}`);
  process.exit(2);
}
try {
  await comando(process.argv.slice(3));
} catch (erro) {
  console.error(`Erro: ${(erro as Error).message}`);
  process.exit(1);
}
