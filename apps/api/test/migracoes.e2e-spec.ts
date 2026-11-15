import { type Contexto, subirApp } from './apoio.js';

describe('banco e migrações (SAD DT-07, DT-17)', () => {
  let ctx: Contexto;
  beforeAll(async () => {
    ctx = await subirApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('a extensão pgcrypto está instalada', async () => {
    const linhas = await ctx.db.query(`SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'`);
    expect(linhas).toHaveLength(1);
  });

  it('subir de novo não reaplica migração nenhuma', async () => {
    const pendentes = await ctx.db.runMigrations();
    expect(pendentes).toHaveLength(0);
  });

  it('o banco trabalha no fuso de São Paulo', async () => {
    const [linha] = await ctx.db.query(`SHOW timezone`);
    expect(linha.TimeZone).toBe('America/Sao_Paulo');
  });
});
