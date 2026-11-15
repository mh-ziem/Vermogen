import request from 'supertest';
import { type Contexto, entrar, reiniciarDados, subirApp } from './apoio.js';

describe('lançamento manual, classificação e auditoria (HU-10, HU-12 a HU-14)', () => {
  let ctx: Contexto;
  let cookie: string;
  let corrente: string;
  let cartao: string;
  let mercado: string;
  let combustivel: string;
  const api = () => request(ctx.app.getHttpServer());
  const post = (url: string, corpo: object) => api().post(url).set('Cookie', cookie).send(corpo);
  const get = (url: string) => api().get(url).set('Cookie', cookie);
  const patch = (url: string, corpo: object) => api().patch(url).set('Cookie', cookie).send(corpo);

  beforeAll(async () => {
    ctx = await subirApp();
  });
  beforeEach(async () => {
    await reiniciarDados(ctx.db);
    cookie = await entrar(ctx);
    const inter = (await post('/api/instituicoes', { nome: 'Inter', cor: '#FF9A3D' })).body;
    corrente = (await post('/api/contas', { instituicaoId: inter.id, nome: 'Conta', tipo: 'corrente', finalidade: 'gasto' })).body.id;
    cartao = (await post('/api/contas', { instituicaoId: inter.id, nome: 'Cartão', tipo: 'cartao', finalidade: 'gasto', diaFechamento: 31, diaVencimento: 7 })).body.id;
    const transporte = (await post('/api/categorias', { nome: 'Transporte', natureza: 'flexivel' }).expect(201)).body;
    combustivel = (await post('/api/categorias', { nome: 'Combustível', paiId: transporte.id }).expect(201)).body.id;
    mercado = (await post('/api/categorias', { nome: 'Mercado', natureza: 'flexivel' }).expect(201)).body.id;
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  describe('HU-10 — lançamento manual', () => {
    it('CA2: entra com origem "manual"; no cartão, é paga no vencimento da fatura', async () => {
      const t = (await post('/api/transacoes', { contaId: cartao, data: '2026-11-15', descricao: 'Tênis', valor: -900 }).expect(201)).body;
      expect(t).toMatchObject({ origem: 'manual', tipo: 'despesa', valor: '-900.00', dataPagamento: '2026-12-07', ciclo: '2026-12' });
    });

    it('receita fora das contas (D3): sem conta, positiva, ligada à transação que compensa', async () => {
      const mensalidade = (await post('/api/transacoes', { contaId: corrente, data: '2026-11-10', descricao: 'Faculdade', valor: -1070 })).body;
      const mae = (
        await post('/api/transacoes', {
          tipo: 'receita_fora_das_contas',
          data: '2026-11-10',
          descricao: 'Metade da faculdade (mãe)',
          valor: 535,
          compensaId: mensalidade.id,
        }).expect(201)
      ).body;
      expect(mae).toMatchObject({ conta: null, tipo: 'receita_fora_das_contas', compensaId: mensalidade.id });
      await post('/api/transacoes', { tipo: 'receita_fora_das_contas', contaId: corrente, data: '2026-11-10', descricao: 'x', valor: 1 }).expect(400);
      await post('/api/transacoes', { tipo: 'receita_fora_das_contas', data: '2026-11-10', descricao: 'x', valor: -1 }).expect(400);
      await post('/api/transacoes', { data: '2026-11-10', descricao: 'sem conta', valor: -1 }).expect(400);
    });
  });

  describe('HU-12 — regras de categorização', () => {
    it('CA1 e CA2: regra por texto, conta e faixa de valor, aplicada na importação', async () => {
      await post('/api/regras', { padrao: 'posto', categoriaId: combustivel }).expect(201);
      await post('/api/regras', { padrao: 'mercado', contaId: cartao, valorMaximo: 500, categoriaId: mercado }).expect(201);
      const r = (
        await post('/api/lotes', {
          contaId: cartao,
          documento: 'Fatura',
          periodo: { de: '2026-10-01', ate: '2026-10-31' },
          fatura: { fechamento: '2026-10-31', vencimento: '2026-11-09' },
          totalDeclarado: -1450,
          itens: [
            { data: '2026-10-02', descricao: 'POSTO IPIRANGA', valor: -200 },
            { data: '2026-10-03', descricao: 'Supermercado Dia', valor: -250 },
            { data: '2026-10-04', descricao: 'Supermercado Atacadão', valor: -1000 },
          ],
        }).expect(201)
      ).body;
      expect(r.semCategoria).toBe(1);
      const t = (await get(`/api/transacoes?loteId=${r.loteId}`)).body.transacoes;
      const cat = Object.fromEntries(t.map((x: { descricao: string; categoria: { nome: string } | null }) => [x.descricao, x.categoria?.nome ?? null]));
      expect(cat).toEqual({ 'POSTO IPIRANGA': 'Combustível', 'Supermercado Dia': 'Mercado', 'Supermercado Atacadão': null });
    });

    it('regra pode definir o tipo: pagamento de fatura não pede categoria', async () => {
      await post('/api/regras', { padrao: 'pagamento fatura', tipo: 'pagamento_fatura' }).expect(201);
      const t = (await post('/api/transacoes', { contaId: corrente, data: '2026-11-09', descricao: 'PAGAMENTO FATURA INTER', valor: -874 })).body;
      expect(t).toMatchObject({ tipo: 'pagamento_fatura', categoria: null });
      expect((await get('/api/pendencias')).body.semCategoria).toHaveLength(0);
    });

    it('CA3: criar e alterar regra fica no log', async () => {
      const regra = (await post('/api/regras', { padrao: 'uber', categoriaId: combustivel }).expect(201)).body;
      await patch(`/api/regras/${regra.id}`, { ativa: false }).expect(200);
      const log = await ctx.db.query(`SELECT operacao, autor FROM auditoria WHERE tabela = 'regra_categorizacao' ORDER BY id`);
      expect(log).toEqual([
        { operacao: 'INSERT', autor: 'matheus' },
        { operacao: 'UPDATE', autor: 'matheus' },
      ]);
    });

    it('recusa regra sem categoria nem tipo, ou com faixa invertida', async () => {
      await post('/api/regras', { padrao: 'x y' }).expect(400);
      await post('/api/regras', { padrao: 'abc', categoriaId: mercado, valorMinimo: 100, valorMaximo: 10 }).expect(400);
    });
  });

  describe('HU-13 — pendências', () => {
    it('categorizar pela pendência e criar regra para as próximas', async () => {
      const t = (await post('/api/transacoes', { contaId: corrente, data: '2026-11-10', descricao: 'Padaria Real', valor: -15 })).body;
      expect((await get('/api/pendencias')).body.semCategoria.map((x: { id: string }) => x.id)).toEqual([t.id]);
      await post('/api/pendencias/resolver', { tipo: 'categorizar', transacaoId: t.id, categoriaId: mercado, criarRegra: { padrao: 'padaria' } }).expect(200);
      expect((await get('/api/pendencias')).body.total).toBe(0);
      const proxima = (await post('/api/transacoes', { contaId: corrente, data: '2026-11-11', descricao: 'PADARIA REAL', valor: -9 })).body;
      expect(proxima.categoria.nome).toBe('Mercado');
    });

    it('CA1: duplicata nunca é descartada sozinha; "excluir" manda para a lixeira', async () => {
      await post('/api/transacoes', { contaId: corrente, data: '2026-11-10', descricao: 'Dízimo', valor: -230 });
      const dup = (await post('/api/transacoes', { contaId: corrente, data: '2026-11-10', descricao: 'Dízimo', valor: -230 })).body;
      expect(dup.duplicata).not.toBeNull();
      await post('/api/pendencias/resolver', { tipo: 'duplicata', transacaoId: dup.id, decisao: 'excluir' }).expect(200);
      expect((await get(`/api/transacoes/${dup.id}`)).body.excluidaEm).not.toBeNull();
    });
  });

  describe('HU-14 — auditoria e exclusão lógica', () => {
    it('CA1: autor, antes e depois de cada alteração', async () => {
      const t = (await post('/api/transacoes', { contaId: corrente, data: '2026-11-10', descricao: 'Padaria', valor: -15 })).body;
      await patch(`/api/transacoes/${t.id}`, { categoriaId: mercado }).expect(200);
      const [ins, upd] = await ctx.db.query(`SELECT autor, operacao, antes, depois FROM auditoria WHERE tabela = 'transacao' ORDER BY id`);
      expect(ins).toMatchObject({ autor: 'matheus', operacao: 'INSERT', antes: null });
      expect(upd.antes.categoria_id).toBeNull();
      expect(upd.depois.categoria_id).toBe(mercado);
    });

    it('CA2: excluir é sempre lógico; restaurar traz de volta', async () => {
      const t = (await post('/api/transacoes', { contaId: corrente, data: '2026-11-10', descricao: 'Padaria', valor: -15 })).body;
      await api().delete(`/api/transacoes/${t.id}`).set('Cookie', cookie).expect(200);
      expect((await get('/api/transacoes')).body.total).toBe(0);
      expect(await ctx.db.query(`SELECT 1 FROM transacao WHERE id = $1`, [t.id])).toHaveLength(1);
      await post(`/api/transacoes/${t.id}/restaurar`, {}).expect(200);
      expect((await get('/api/transacoes')).body.total).toBe(1);
    });

    it('valor e data não podem ser editados (PRD §3.3)', async () => {
      const t = (await post('/api/transacoes', { contaId: corrente, data: '2026-11-10', descricao: 'Padaria', valor: -15 })).body;
      await patch(`/api/transacoes/${t.id}`, { valor: -16 }).expect(400);
      await patch(`/api/transacoes/${t.id}`, { data: '2026-11-11' }).expect(400);
    });

    it('a anotação fica criptografada no banco (pgcrypto)', async () => {
      const t = (await post('/api/transacoes', { contaId: corrente, data: '2026-11-10', descricao: 'Presente', valor: -150 })).body;
      await api().put(`/api/transacoes/${t.id}/anotacao`).set('Cookie', cookie).send({ texto: 'aniversário da Ana' }).expect(200);
      const [linha] = await ctx.db.query(`SELECT anotacao FROM transacao WHERE id = $1`, [t.id]);
      expect(Buffer.from(linha.anotacao).toString('utf8')).not.toContain('Ana');
      expect((await get(`/api/transacoes/${t.id}/anotacao`)).body).toEqual({ anotacao: 'aniversário da Ana' });
    });
  });

  it('categorias: dois níveis, nome único por nível', async () => {
    const [sub] = (await get('/api/categorias')).body.filter((c: { nome: string }) => c.nome === 'Combustível');
    await post('/api/categorias', { nome: 'Gasolina', paiId: sub.id }).expect(400);
    await post('/api/categorias', { nome: 'mercado' }).expect(409);
  });
});
