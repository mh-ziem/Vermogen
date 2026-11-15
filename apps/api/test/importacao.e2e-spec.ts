import request from 'supertest';
import { type Contexto, entrar, reiniciarDados, subirApp } from './apoio.js';

describe('importação de lotes (HU-08, HU-09)', () => {
  let ctx: Contexto;
  let cookie: string;
  let nubank: string;
  let inter: string;
  let mercado: string;
  const api = () => request(ctx.app.getHttpServer());
  const post = (url: string, corpo: object) => api().post(url).set('Cookie', cookie).send(corpo);
  const get = (url: string) => api().get(url).set('Cookie', cookie);

  async function conta(instituicao: string, cor: string, dados: object): Promise<string> {
    const inst = (await post('/api/instituicoes', { nome: instituicao, cor }).expect(201)).body;
    return (await post('/api/contas', { instituicaoId: inst.id, finalidade: 'gasto', ...dados }).expect(201)).body.id;
  }

  const faturaNubank = () => ({
    contaId: nubank,
    documento: 'Fatura Nubank venc. 09/11/2026',
    periodo: { de: '2026-10-01', ate: '2026-10-31' },
    fatura: { fechamento: '2026-11-01', vencimento: '2026-11-09' },
    totalDeclarado: -1146.0,
    itens: [
      { data: '2026-10-05', descricao: 'Supermercado Pão de Açúcar', valor: -300.1 },
      { data: '2026-10-12', descricao: 'Posto Shell', valor: '-200.00' },
      { data: '2026-08-10', descricao: 'Loja X parcela 3/4', valor: -290, parcela: { numero: 3, total: 4 } },
      { data: '2026-10-30', descricao: 'Restaurante', valor: -360.9 },
      { data: '2026-10-20', descricao: 'Estorno', valor: 5 },
    ],
  });

  beforeAll(async () => {
    ctx = await subirApp();
  });
  beforeEach(async () => {
    await reiniciarDados(ctx.db);
    cookie = await entrar(ctx);
    nubank = await conta('Nubank', '#8A05BE', { nome: 'Cartão', tipo: 'cartao', diaFechamento: 1, diaVencimento: 9 });
    inter = await conta('Inter', '#FF9A3D', { nome: 'Conta corrente', tipo: 'corrente' });
    mercado = await conta('Mercado Pago', '#00B1EA', { nome: 'Cartão', tipo: 'cartao', diaFechamento: 29, diaVencimento: 4 });
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('aceita o lote quando a soma confere com o total e põe tudo na fatura do documento', async () => {
    const r = (await post('/api/lotes', faturaNubank()).expect(201)).body;
    expect(r).toMatchObject({ status: 'aceito', conferencia: 'total', itens: 5, novas: 5, possiveisDuplicatas: 0 });
    const { transacoes, soma } = (await get(`/api/transacoes?loteId=${r.loteId}`).expect(200)).body;
    expect(soma).toBe('-1146.00');
    // A parcela antiga (comprada em agosto) é paga nesta fatura, no ciclo Novembro (RN-08).
    const parcela = transacoes.find((t: { parcela: unknown }) => t.parcela);
    expect(parcela).toMatchObject({ dataCompra: '2026-08-10', dataPagamento: '2026-11-09', ciclo: '2026-11', parcela: { numero: 3, total: 4 } });
    expect((await get('/api/transacoes?ciclo=2026-11').expect(200)).body.total).toBe(5);
  });

  it('CA1: soma diferente do total → rejeitado, com a diferença, e nada gravado', async () => {
    const lote = { ...faturaNubank(), totalDeclarado: -1146.1 };
    const r = await post('/api/lotes', lote).expect(422);
    expect(r.body.message).toMatch(/Diferença: R\$ 0,10/);
    expect(await ctx.db.query(`SELECT 1 FROM transacao`)).toHaveLength(0);
    expect(await ctx.db.query(`SELECT 1 FROM importacao`)).toHaveLength(0);
  });

  it('CA2: o mesmo lote reenviado → 0 transações novas (QA-05)', async () => {
    const primeiro = (await post('/api/lotes', faturaNubank()).expect(201)).body;
    const lote = faturaNubank();
    lote.itens.reverse();
    const segundo = (await post('/api/lotes', lote).expect(201)).body;
    expect(segundo).toMatchObject({ status: 'repetido', loteId: primeiro.loteId, novas: 0 });
    expect(await ctx.db.query(`SELECT 1 FROM transacao`)).toHaveLength(5);
  });

  it('também é repetido o lote da mesma conta, período e total, mesmo com descrição lida diferente', async () => {
    await post('/api/lotes', faturaNubank()).expect(201);
    const lote = faturaNubank();
    lote.itens[0]!.descricao = 'SUPERMERC PAO ACUCAR';
    expect((await post('/api/lotes', lote).expect(201)).body.status).toBe('repetido');
  });

  it('CA3: sem total, confere pelo saldo inicial + movimentos = saldo final', async () => {
    const extrato = {
      contaId: inter,
      documento: 'Extrato Inter outubro',
      periodo: { de: '2026-10-01', ate: '2026-10-31' },
      saldoInicial: 1000,
      saldoFinal: 1300.5,
      itens: [
        { data: '2026-10-02', descricao: 'Pix recebido', valor: 500.5 },
        { data: '2026-10-15', descricao: 'Conta de luz', valor: -200 },
      ],
    };
    expect((await post('/api/lotes', extrato).expect(201)).body).toMatchObject({ status: 'aceito', conferencia: 'saldo' });
    const t = (await get('/api/transacoes?contaId=' + inter).expect(200)).body.transacoes;
    expect(t.map((x: { dataPagamento: string; dataCompra: string }) => x.dataPagamento === x.dataCompra)).toEqual([true, true]);
    await post('/api/lotes', { ...extrato, saldoFinal: 1300, documento: 'outro' }).expect(422);
  });

  it('CA4: sem total nem saldo → "não conferido", vai para as pendências e pode ser aceito', async () => {
    const print = {
      contaId: inter,
      documento: 'Print parcial',
      periodo: { de: '2026-10-01', ate: '2026-10-31' },
      itens: [{ data: '2026-10-03', descricao: 'Padaria', valor: -12.5 }],
    };
    const r = (await post('/api/lotes', print).expect(201)).body;
    expect(r).toMatchObject({ status: 'nao_conferido', conferencia: 'nenhuma' });
    const pend = (await get('/api/pendencias').expect(200)).body;
    expect(pend.lotesNaoConferidos.map((l: { id: string }) => l.id)).toEqual([r.loteId]);
    await post('/api/pendencias/resolver', { tipo: 'lote', loteId: r.loteId, decisao: 'aceitar' }).expect(200);
    expect((await get('/api/pendencias').expect(200)).body.lotesNaoConferidos).toHaveLength(0);
  });

  it('cartão sem fatura no lote: cada compra vai para a fatura calculada pela data', async () => {
    const r = (
      await post('/api/lotes', {
        contaId: mercado,
        documento: 'Planilha · Mercado Pago · outubro',
        periodo: { de: '2026-10-01', ate: '2026-10-31' },
        totalDeclarado: -150,
        itens: [
          { data: '2026-10-20', descricao: 'Compra A', valor: -100 },
          { data: '2026-10-30', descricao: 'Compra B', valor: -50 },
        ],
      }).expect(201)
    ).body;
    const t = (await get(`/api/transacoes?loteId=${r.loteId}`).expect(200)).body.transacoes;
    const porDescricao = Object.fromEntries(t.map((x: { descricao: string; dataPagamento: string }) => [x.descricao, x.dataPagamento]));
    expect(porDescricao).toEqual({ 'Compra A': '2026-11-04', 'Compra B': '2026-12-04' });
  });

  it('conta corrente recusa item fora do período; lote vazio e valor zero são recusados', async () => {
    const base = { contaId: inter, documento: 'x', periodo: { de: '2026-10-01', ate: '2026-10-31' }, totalDeclarado: -10 };
    await post('/api/lotes', { ...base, itens: [{ data: '2026-11-01', descricao: 'fora', valor: -10 }] }).expect(400);
    await post('/api/lotes', { ...base, itens: [] }).expect(400);
    await post('/api/lotes', { ...base, itens: [{ data: '2026-10-01', descricao: 'zero', valor: 0 }] }).expect(400);
    await post('/api/lotes', { ...base, itens: [{ data: '2026-10-01', descricao: 'x', valor: -10.005 }] }).expect(400);
  });

  it('D2: transação igual a uma já gravada entra como possível duplicata, nunca descartada', async () => {
    await post('/api/lotes', faturaNubank()).expect(201);
    const outro = {
      contaId: nubank,
      documento: 'Print do app Nubank',
      periodo: { de: '2026-10-12', ate: '2026-10-12' },
      totalDeclarado: -200,
      itens: [{ data: '2026-10-12', descricao: 'POSTO SHELL', valor: -200 }],
    };
    const r = (await post('/api/lotes', outro).expect(201)).body;
    expect(r).toMatchObject({ status: 'aceito', novas: 0, possiveisDuplicatas: 1 });
    const pend = (await get('/api/pendencias').expect(200)).body;
    expect(pend.possiveisDuplicatas).toHaveLength(1);
    expect(pend.possiveisDuplicatas[0].original.descricao).toBe('Posto Shell');

    // Dois dízimos iguais no mesmo dia, para igrejas diferentes: o Matheus decide que não é duplicata.
    const id = pend.possiveisDuplicatas[0].transacao.id;
    await post('/api/pendencias/resolver', { tipo: 'duplicata', transacaoId: id, decisao: 'manter' }).expect(200);
    expect((await get('/api/pendencias').expect(200)).body.possiveisDuplicatas).toHaveLength(0);
    expect((await get(`/api/transacoes/${id}`).expect(200)).body.excluidaEm).toBeNull();
  });

  it('duplicata dentro do próprio lote também é marcada', async () => {
    const r = (
      await post('/api/lotes', {
        contaId: inter,
        documento: 'Extrato',
        periodo: { de: '2026-10-01', ate: '2026-10-31' },
        totalDeclarado: -920,
        itens: [
          { data: '2026-10-05', descricao: 'Dízimo', valor: -460 },
          { data: '2026-10-05', descricao: 'Dízimo', valor: -460 },
        ],
      }).expect(201)
    ).body;
    expect(r.possiveisDuplicatas).toBe(1);
  });

  describe('HU-09 — desfazer lote', () => {
    it('CA1 e CA2: as transações somem das telas, o lote fica "desfeito" e pode ser reimportado', async () => {
      const r = (await post('/api/lotes', faturaNubank()).expect(201)).body;
      const desfeito = (await post(`/api/lotes/${r.loteId}/desfazer`, {}).expect(200)).body;
      expect(desfeito.status).toBe('desfeito');
      expect((await get('/api/transacoes?ciclo=2026-11').expect(200)).body.total).toBe(0);
      expect((await get('/api/transacoes?excluidas=true').expect(200)).body.total).toBe(5);

      const novo = (await post('/api/lotes', faturaNubank()).expect(201)).body;
      expect(novo).toMatchObject({ status: 'aceito', novas: 5, possiveisDuplicatas: 0 });
      expect(novo.loteId).not.toBe(r.loteId);
      await post(`/api/lotes/${r.loteId}/desfazer`, {}).expect(409);
    });

    it('transação de lote desfeito não pode ser restaurada sozinha', async () => {
      const r = (await post('/api/lotes', faturaNubank()).expect(201)).body;
      await post(`/api/lotes/${r.loteId}/desfazer`, {}).expect(200);
      const [{ id }] = await ctx.db.query(`SELECT id FROM transacao LIMIT 1`);
      await post(`/api/transacoes/${id}/restaurar`, {}).expect(409);
    });
  });

  it('a fatura do cartão é criada uma vez por vencimento', async () => {
    await post('/api/lotes', faturaNubank()).expect(201);
    const faturas = await ctx.db.query(`SELECT to_char(fechamento, 'YYYY-MM-DD') AS f, to_char(vencimento, 'YYYY-MM-DD') AS v, status FROM fatura`);
    expect(faturas).toEqual([{ f: '2026-11-01', v: '2026-11-09', status: 'fechada' }]);
  });
});
