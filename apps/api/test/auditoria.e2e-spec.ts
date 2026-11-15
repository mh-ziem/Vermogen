import request from 'supertest';
import { type Contexto, entrar, reiniciarDados, subirApp } from './apoio.js';

describe('auditoria (DT-09, QA-06)', () => {
  let ctx: Contexto;
  let cookie: string;
  const api = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await subirApp();
  });
  beforeEach(async () => {
    await reiniciarDados(ctx.db);
    cookie = await entrar(ctx);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('toda alteração pela tela fica no log com autor "matheus", antes e depois', async () => {
    const inst = (await api().post('/api/instituicoes').set('Cookie', cookie).send({ nome: 'Itaú', cor: '#EC7000' }).expect(201)).body;
    await api().patch(`/api/instituicoes/${inst.id}`).set('Cookie', cookie).send({ cor: '#FF0000' }).expect(200);

    const log = await ctx.db.query(`SELECT autor, tabela, registro_id, operacao, antes, depois FROM auditoria ORDER BY id`);
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ autor: 'matheus', tabela: 'instituicao', registro_id: inst.id, operacao: 'INSERT', antes: null });
    expect(log[1].operacao).toBe('UPDATE');
    expect(log[1].antes.cor).toBe('#EC7000');
    expect(log[1].depois.cor).toBe('#FF0000');
  });

  it('o banco recusa gravação sem autor', async () => {
    await expect(ctx.db.query(`INSERT INTO instituicao (nome, cor) VALUES ('X', '#000000')`)).rejects.toThrow(/sem autor/);
    await expect(
      ctx.db.transaction(async (m) => {
        await m.query(`SELECT set_config('vermogen.autor', 'hacker', true)`);
        await m.query(`INSERT INTO instituicao (nome, cor) VALUES ('X', '#000000')`);
      }),
    ).rejects.toThrow(/sem autor/);
  });

  it('o log não pode ser apagado nem reescrito; só marcado como revisado', async () => {
    await api().post('/api/instituicoes').set('Cookie', cookie).send({ nome: 'Itaú', cor: '#EC7000' }).expect(201);
    await expect(ctx.db.query(`DELETE FROM auditoria`)).rejects.toThrow(/não pode ser apagado/);
    await expect(ctx.db.query(`UPDATE auditoria SET autor = 'claude'`)).rejects.toThrow(/não pode ser alterado/);
    await ctx.db.query(`UPDATE auditoria SET revisado = true`);
  });

  it('salvar sem mudar nada não gera registro', async () => {
    const inst = (await api().post('/api/instituicoes').set('Cookie', cookie).send({ nome: 'Itaú', cor: '#EC7000' }).expect(201)).body;
    await api().patch(`/api/instituicoes/${inst.id}`).set('Cookie', cookie).send({ cor: '#EC7000' }).expect(200);
    expect(await ctx.db.query(`SELECT 1 FROM auditoria`)).toHaveLength(1);
  });

  it('a data real do salário também fica no log', async () => {
    await api().put('/api/ciclos/2026-12/salario').set('Cookie', cookie).send({ data: '2026-12-01' }).expect(200);
    const [linha] = await ctx.db.query(`SELECT tabela, registro_id, autor FROM auditoria`);
    expect(linha).toEqual({ tabela: 'ciclo', registro_id: '2026-12', autor: 'matheus' });
  });
});
