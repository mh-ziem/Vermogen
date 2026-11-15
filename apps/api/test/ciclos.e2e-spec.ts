import request from 'supertest';
import { type Contexto, entrar, reiniciarDados, subirApp } from './apoio.js';

describe('ciclos e faturas pela API (HU-06, HU-07)', () => {
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

  it('lista os ciclos com início, fim e vale (PRD §9.2)', async () => {
    const r = await api().get('/api/ciclos?de=2026-11&ate=2027-02').set('Cookie', cookie).expect(200);
    expect(r.body.map((c: { id: string; inicio: string; fim: string }) => [c.id, c.inicio, c.fim])).toEqual([
      ['2026-11', '2026-10-30', '2026-11-29'],
      ['2026-12', '2026-11-30', '2026-12-29'],
      ['2027-01', '2026-12-30', '2027-01-28'],
      ['2027-02', '2027-01-29', '2027-02-25'],
    ]);
    expect(r.body[1].creditoDoVale).toBe('2026-12-24');
  });

  it('HU-06 CA4: a data real do salário substitui a calculada e move as faturas de ciclo', async () => {
    const inst = (await api().post('/api/instituicoes').set('Cookie', cookie).send({ nome: 'Inter', cor: '#FF9A3D' })).body;
    const cartao = (
      await api()
        .post('/api/contas')
        .set('Cookie', cookie)
        .send({ instituicaoId: inst.id, nome: 'Cartão', tipo: 'cartao', finalidade: 'gasto', diaFechamento: 31, diaVencimento: 7 })
    ).body;
    const fatura = () => api().get(`/api/contas/${cartao.id}/fatura?compra=2026-11-15`).set('Cookie', cookie).expect(200);
    expect((await fatura()).body.ciclo).toBe('2026-12');

    const ciclo = await api().put('/api/ciclos/2026-12/salario').set('Cookie', cookie).send({ data: '2026-12-08' }).expect(200);
    expect(ciclo.body).toMatchObject({ inicio: '2026-12-08', salarioEsperado: '2026-11-30', salarioReal: '2026-12-08' });
    expect((await fatura()).body.ciclo).toBe('2026-11'); // venceu em 07/12, antes do salário real

    await api().delete('/api/ciclos/2026-12/salario').set('Cookie', cookie).expect(200);
    expect((await fatura()).body.ciclo).toBe('2026-12');
  });

  it('recusa data real longe da esperada ou ciclo inválido', async () => {
    await api().put('/api/ciclos/2026-12/salario').set('Cookie', cookie).send({ data: '2026-12-25' }).expect(400);
    await api().put('/api/ciclos/2026-13/salario').set('Cookie', cookie).send({ data: '2026-12-01' }).expect(404);
    await api().put('/api/ciclos/2026-12/salario').set('Cookie', cookie).send({ data: '01/12/2026' }).expect(400);
  });

  it('lista os feriados bancários do ano', async () => {
    const r = await api().get('/api/feriados?ano=2026').set('Cookie', cookie).expect(200);
    expect(r.body).toContainEqual({ data: '2026-06-04', nome: 'Corpus Christi' });
  });
});
