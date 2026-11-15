import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { carregarConfig, lerSegredo } from './config.js';

function arquivoCom(conteudo: string): string {
  const caminho = join(mkdtempSync(join(tmpdir(), 'vermogen-')), 'segredo');
  writeFileSync(caminho, conteudo);
  return caminho;
}

describe('lerSegredo', () => {
  it('lê o segredo do arquivo e remove a quebra de linha final', () => {
    expect(lerSegredo({ X_FILE: arquivoCom('abc123\n') }, 'X')).toBe('abc123');
  });

  it('em produção, recusa segredo passado direto na variável (QA-03)', () => {
    expect(() => lerSegredo({ NODE_ENV: 'production', X: 'abc' }, 'X')).toThrow(/X_FILE/);
  });

  it('fora de produção, aceita o valor direto', () => {
    expect(lerSegredo({ NODE_ENV: 'test', X: 'abc' }, 'X')).toBe('abc');
  });

  it('recusa arquivo de segredo vazio', () => {
    expect(() => lerSegredo({ X_FILE: arquivoCom('\n') }, 'X')).toThrow(/vazio/);
  });
});

describe('carregarConfig', () => {
  const base = { DB_HOST: 'db', DB_PASSWORD: 's', PGCRYPTO_KEY: 'k' };

  it('usa os padrões do contrato (SAD §6)', () => {
    const config = carregarConfig(base);
    expect(config.porta).toBe(3000);
    expect(config.db).toMatchObject({ host: 'db', porta: 5432, nome: 'vermogen', usuario: 'vermogen' });
    expect(config.versao).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('marca o cookie como seguro só quando o endereço público é https', () => {
    expect(carregarConfig({ ...base, PUBLIC_URL: 'https://x.ts.net' }).cookieSeguro).toBe(true);
    expect(carregarConfig({ ...base, PUBLIC_URL: 'http://localhost:3000' }).cookieSeguro).toBe(false);
  });

  it('falha com mensagem clara quando falta variável obrigatória', () => {
    expect(() => carregarConfig({ DB_PASSWORD: 's', PGCRYPTO_KEY: 'k' })).toThrow(/DB_HOST/);
  });
});
