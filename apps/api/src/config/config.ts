import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Configuração do app, lida das variáveis de ambiente (contrato: docs/SAD.md §6). */
export interface Config {
  porta: number;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  publicUrl: string;
  /** O cookie de sessão sai com "Secure" quando o app é acessado por https. */
  cookieSeguro: boolean;
  db: { host: string; porta: number; nome: string; usuario: string; senha: string };
  pgcryptoKey: string;
  /** Pasta com os arquivos estáticos do frontend (apps/web/dist). */
  webDist: string;
  versao: string;
}

export const CONFIG = Symbol('CONFIG');

type Ambiente = Record<string, string | undefined>;

function texto(env: Ambiente, nome: string, padrao?: string): string {
  const valor = env[nome]?.trim();
  if (valor) return valor;
  if (padrao !== undefined) return padrao;
  throw new Error(`Variável de ambiente obrigatória ausente: ${nome}`);
}

function inteiro(env: Ambiente, nome: string, padrao: number): number {
  const bruto = env[nome]?.trim();
  if (!bruto) return padrao;
  const valor = Number(bruto);
  if (!Number.isInteger(valor) || valor <= 0) {
    throw new Error(`Variável ${nome} precisa ser um número inteiro positivo`);
  }
  return valor;
}

/**
 * Lê um segredo. Em produção, só por arquivo (`<NOME>_FILE`, SAD DT-18).
 * Fora de produção, aceita também o valor direto em `<NOME>`, para desenvolvimento e testes.
 */
export function lerSegredo(env: Ambiente, nome: string): string {
  const caminho = env[`${nome}_FILE`]?.trim();
  if (caminho) {
    const valor = readFileSync(caminho, 'utf8').trim();
    if (!valor) throw new Error(`O arquivo de segredo ${nome}_FILE está vazio`);
    return valor;
  }
  const direto = env[nome];
  if (direto && env.NODE_ENV !== 'production') return direto;
  throw new Error(`Segredo ausente: defina ${nome}_FILE com o caminho do arquivo`);
}

function lerVersao(): string {
  // De src/config ou de dist/config, o package.json do app fica dois níveis acima.
  const caminho = resolve(import.meta.dirname, '../../package.json');
  if (!existsSync(caminho)) return 'desconhecida';
  return (JSON.parse(readFileSync(caminho, 'utf8')) as { version?: string }).version ?? 'desconhecida';
}

export function carregarConfig(env: Ambiente = process.env): Config {
  const logLevel = texto(env, 'LOG_LEVEL', 'info');
  if (!['error', 'warn', 'info', 'debug'].includes(logLevel)) {
    throw new Error('LOG_LEVEL precisa ser error, warn, info ou debug');
  }
  const publicUrl = texto(env, 'PUBLIC_URL', 'http://localhost:3000');
  return {
    porta: inteiro(env, 'PORT', 3000),
    logLevel: logLevel as Config['logLevel'],
    publicUrl,
    cookieSeguro: publicUrl.startsWith('https://'),
    db: {
      host: texto(env, 'DB_HOST'),
      porta: inteiro(env, 'DB_PORT', 5432),
      nome: texto(env, 'DB_NAME', 'vermogen'),
      usuario: texto(env, 'DB_USER', 'vermogen'),
      senha: lerSegredo(env, 'DB_PASSWORD'),
    },
    pgcryptoKey: lerSegredo(env, 'PGCRYPTO_KEY'),
    webDist: resolve(texto(env, 'WEB_DIST', resolve(import.meta.dirname, '../../../web/dist'))),
    versao: lerVersao(),
  };
}
