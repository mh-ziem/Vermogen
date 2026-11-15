import request from 'supertest';
import { hoje, somarDias } from '../src/calendario/datas.js';
import { cicloDaData, descreverCiclo, somarCiclos } from '../src/calendario/regras.js';
import { faturasComVencimentoEntre } from '../src/faturas/regras.js';
import { TokensService } from '../src/mcp/tokens.service.js';
import { type Contexto, entrar, reiniciarDados, subirApp } from './apoio.js';

/** As datas dos testes partem do ciclo de hoje: a projeção sempre começa no ciclo atual. */
const C0 = cicloDaData(hoje());
const ciclo = (n: number) => descreverCiclo(somarCiclos(C0, n));
const meio = (n: number) => somarDias(ciclo(n).inicio, 5);
const NUBANK = { diaFechamento: 1, diaVencimento: 9 };

describe('projeção, parâmetros e abertura (HU-15 a HU-17)', () => {
  let ctx: Contexto;
  let cookie: string;
  let corrente: string;
  let cartao: string;
  const api = () => request(ctx.app.getHttpServer());
  const post = (url: string, corpo: object = {}) => api().post(url).set('Cookie', cookie).send(corpo);
  const put = (url: string, corpo: object) => api().put(url).set('Cookie', cookie).send(corpo);
  const get = (url: string) => api().get(url).set('Cookie', cookie);

  beforeAll(async () => {
    ctx = await subirApp();
  });
  beforeEach(async () => {
    await reiniciarDados(ctx.db);
    cookie = await entrar(ctx);
    const nu = (await post('/api/instituicoes', { nome: 'Nubank', cor: '#8A05BE' })).body;
    const itau = (await post('/api/instituicoes', { nome: 'Itaú', cor: '#EC7000' })).body;
    corrente = (await post('/api/contas', { instituicaoId: itau.id, nome: 'Conta', tipo: 'corrente', finalidade: 'recebimento' })).body.id;
    cartao = (await post('/api/contas', { instituicaoId: nu.id, nome: 'Cartão', tipo: 'cartao', finalidade: 'gasto', ...NUBANK })).body.id;
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  /** Fatura do Nubank paga no ciclo atual, com uma compra parcelada (2/4) e uma à vista. */
  async function importarFaturaDoCicloAtual() {
    const f = faturasComVencimentoEntre(NUBANK, ciclo(0).inicio, ciclo(0).fim)[0]!;
    const dia = somarDias(f.fechamento, -10);
    return (
      await post('/api/lotes', {
        contaId: cartao,
        documento: 'Fatura Nubank',
        periodo: { de: somarDias(f.fechamento, -30), ate: somarDias(f.fechamento, -1) },
        fatura: f,
        totalDeclarado: -400,
        itens: [
          { data: dia, descricao: 'CELULAR PARC 02/04', valor: -300, parcela: { numero: 2, total: 4 } },
          { data: dia, descricao: 'Mercado', valor: -100 },
        ],
      }).expect(201)
    ).body;
  }

  it('sem salário, a projeção avisa que não está configurada; com salário, CA2 fecha a conta', async () => {
    const vazia = (await get('/api/projecao').expect(200)).body;
    expect(vazia).toMatchObject({ configurada: false, cicloAtual: C0, ultimosDados: null, congelamentoDoCicloAtual: null });
    expect(vazia.ciclos).toHaveLength(12);

    await put('/api/parametros', { salario: 4600 }).expect(200);
    const p = (await get('/api/projecao')).body;
    expect(p.configurada).toBe(true);
    expect(p.parametros).toEqual({ salario: '4600.00', aportePercentual: 10, orcamentoFlexiveis: '1420.00', folgaMinima: '300.00' });
    const c = p.ciclos[0];
    expect(c).toMatchObject({ receita: '4600.00', dizimo: '-460.00', aporte: '-460.00' });
    const soma = [c.receita, c.dizimo, c.totais.faturas, c.totais.fixas, c.aporte].reduce((a, v) => a + Math.round(Number(v) * 100), 0);
    expect(Math.round(Number(c.resultadoLiquido) * 100)).toBe(soma);
  });

  it('parâmetros: valem do ciclo atual em diante, ficam no log e são validados', async () => {
    const r = (await put('/api/parametros', { aportePercentual: 12.5, orcamentoFlexiveis: '1500.00', folgaMinima: 250 }).expect(200)).body;
    expect(r).toEqual({ salario: null, aportePercentual: 12.5, orcamentoFlexiveis: '1500.00', folgaMinima: '250.00' });
    const linhas = await ctx.db.query(`SELECT DISTINCT a_partir_de FROM parametro`);
    expect(linhas).toEqual([{ a_partir_de: C0 }]);
    const [log] = await ctx.db.query(`SELECT DISTINCT autor FROM auditoria WHERE tabela = 'parametro'`);
    expect(log.autor).toBe('matheus');
    await put('/api/parametros', { aportePercentual: 150 }).expect(400);
    await put('/api/parametros', { salario: -1 }).expect(400);
    await put('/api/parametros', {}).expect(400);
  });

  it('RN-10: fixas pelo maior dos 3 ciclos; valor fixo prevalece e pode ser desfeito', async () => {
    const moradia = (await post('/api/categorias', { nome: 'Moradia', natureza: 'intermitente' })).body;
    const luz = (await post('/api/categorias', { nome: 'Luz', paiId: moradia.id })).body;
    const mercado = (await post('/api/categorias', { nome: 'Mercado', natureza: 'flexivel' })).body;
    for (const [n, valor] of [[-3, -150], [-2, -186], [-1, -170]] as const) {
      await post('/api/transacoes', { contaId: corrente, data: meio(n), descricao: 'Conta de luz', valor, categoriaId: luz.id }).expect(201);
    }
    const [fixa] = (await get('/api/fixas').expect(200)).body.filter((f: { categoria: { id: string } }) => f.categoria.id === luz.id);
    expect(fixa).toMatchObject({ categoria: { nome: 'Luz', pai: 'Moradia' }, maiorDos3: '186.00', valorFixo: null });
    expect(fixa.historico.map((h: { valor: string }) => h.valor)).toEqual(['150.00', '186.00', '170.00']);
    const projetada = async () => (await get('/api/projecao')).body.ciclos[1].fixas.find((f: { categoriaId: string }) => f.categoriaId === luz.id);
    expect(await projetada()).toMatchObject({ valor: '-186.00', base: 'maior_3' });

    expect((await put(`/api/fixas/${luz.id}`, { valor: 200 }).expect(200)).body.valorFixo).toBe('200.00');
    expect(await projetada()).toMatchObject({ valor: '-200.00', base: 'fixo' });
    expect((await put(`/api/fixas/${luz.id}`, { valor: null }).expect(200)).body.valorFixo).toBeNull();
    expect(await projetada()).toMatchObject({ base: 'maior_3' });
    await put(`/api/fixas/${mercado.id}`, { valor: 10 }).expect(400);
  });

  it('livre para gastar: orçamento menos os gastos flexíveis do ciclo', async () => {
    await post('/api/transacoes', { contaId: corrente, data: hoje(), descricao: 'Padaria', valor: -50 }).expect(201);
    const { livreParaGastar } = (await get('/api/projecao')).body;
    expect(livreParaGastar).toEqual({ orcamento: '1420.00', usado: '50.00', livre: '1370.00' });
  });

  it('faturas: a importada entra com o valor real; as parcelas seguintes vão para as próximas faturas', async () => {
    await importarFaturaDoCicloAtual();
    const p = (await get('/api/projecao')).body;
    expect(p.ultimosDados).not.toBeNull();
    const nubank = (i: number) => p.ciclos[i].faturas.find((f: { conta: { id: string } }) => f.conta.id === cartao);
    expect(nubank(0)).toMatchObject({ realizado: '-400.00' });
    expect(['fechada', 'projetada']).toContain(nubank(0).status);
    expect(nubank(1).itens).toContainEqual({ descricao: 'CELULAR PARC 02/04 · parcela 3/4', valor: '-300.00', origem: 'parcela' });
    expect(nubank(2).itens).toContainEqual(expect.objectContaining({ descricao: 'CELULAR PARC 02/04 · parcela 4/4' }));
    expect(nubank(3).itens.some((i: { origem: string }) => i.origem === 'parcela')).toBe(false);
  });

  describe('abertura do ciclo (HU-17)', () => {
    it('etapa 1: documentos por conta; a fatura paga no ciclo conta para o cartão', async () => {
      await importarFaturaDoCicloAtual();
      const a = (await get('/api/abertura').expect(200)).body;
      expect(a.ciclo.id).toBe(C0);
      expect(a.anterior).toBe(somarCiclos(C0, -1));
      const status = Object.fromEntries(a.entrada.map((e: { conta: { id: string }; status: string }) => [e.conta.id, e.status]));
      expect(status).toEqual({ [cartao]: 'aceito', [corrente]: 'aguardando' });
      expect(a.pendencias.semCategoria).toBe(2);
    });

    it('CA4: aporte e orçamento ajustáveis; ficam no plano do ciclo e no log', async () => {
      await put('/api/parametros', { salario: 4600 });
      const a = (await put('/api/abertura/plano', { aporte: '300.00', orcamentoFlexiveis: 1000 }).expect(200)).body;
      expect(a.plano).toEqual({ aporte: '300.00', orcamentoFlexiveis: '1000.00', ajustado: true });
      expect(a.distribuicao).toMatchObject({ aporte: '-300.00', orcamentoFlexiveis: '1000.00', ajustado: true });
      const proximo = (await get('/api/projecao')).body.ciclos[1];
      expect(proximo.flexiveisNosCartoes.orcamentoDoCicloAnterior).toBe('1000.00');
      await put('/api/abertura/plano', { aporte: -1, orcamentoFlexiveis: 1000 }).expect(400);
      const [log] = await ctx.db.query(`SELECT autor FROM auditoria WHERE tabela = 'plano_ciclo'`);
      expect(log.autor).toBe('matheus');
    });

    it('CA1 e CA2: congelar com pendências é permitido e marca incompleto; guarda a data; congelar de novo substitui', async () => {
      await put('/api/parametros', { salario: 4600 });
      await importarFaturaDoCicloAtual();
      const c = (await post('/api/abertura/congelar').expect(201)).body;
      expect(c).toMatchObject({ ciclo: C0, incompleta: true, lotesAceitos: 1, contasEsperadas: 2, pendencias: 2 });
      expect(Date.now() - Date.parse(c.congeladaEm)).toBeLessThan(60_000);
      const [linha] = await ctx.db.query(`SELECT detalhe FROM snapshot_projecao WHERE id = $1`, [C0]);
      expect(linha.detalhe.ciclos).toHaveLength(12);
      expect((await get('/api/projecao')).body.congelamentoDoCicloAtual).toMatchObject({ ciclo: C0, incompleta: true });
      expect((await get('/api/abertura')).body.congelamento).toMatchObject({ resultadoLiquido: c.resultadoLiquido });

      await post('/api/abertura/congelar').expect(201);
      expect(await ctx.db.query(`SELECT count(*)::int AS n FROM snapshot_projecao`)).toEqual([{ n: 1 }]);
      const log = await ctx.db.query(`SELECT operacao FROM auditoria WHERE tabela = 'snapshot_projecao' ORDER BY id`);
      expect(log.map((l: { operacao: string }) => l.operacao)).toEqual(['INSERT', 'UPDATE']);
    });
  });

  it('MCP consultar_projecao: resumo dos 12 ciclos e detalhe de um ciclo', async () => {
    await put('/api/parametros', { salario: 4600 });
    const { token } = await ctx.app.get(TokensService).criar('teste');
    const r = await api()
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Authorization', `Bearer ${token}`)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'consultar_projecao', arguments: { detalharCiclo: C0 } } })
      .expect(200);
    const dados = r.body.result.structuredContent;
    expect(dados.ciclos).toHaveLength(12);
    expect(dados.ciclos[0]).toMatchObject({ ciclo: C0, receita: '4600.00', dizimo: '-460.00' });
    expect(dados.detalhe.ciclo.id).toBe(C0);
  });
});
