import request from 'supertest';
import { TokensService } from '../src/mcp/tokens.service.js';
import { type Contexto, entrar, reiniciarDados, subirApp } from './apoio.js';

const ACEITA = 'application/json, text/event-stream';

function chamada(id: number, method: string, params: object = {}) {
  return { jsonrpc: '2.0', id, method, params };
}

describe('MCP (DT-11 a DT-13)', () => {
  let ctx: Contexto;
  let token: string;
  const mcp = (corpo: object, credencial = token) =>
    request(ctx.app.getHttpServer())
      .post('/mcp')
      .set('Accept', ACEITA)
      .set('Authorization', `Bearer ${credencial}`)
      .send(corpo);

  beforeAll(async () => {
    ctx = await subirApp();
  });
  beforeEach(async () => {
    await reiniciarDados(ctx.db);
    token = (await ctx.app.get(TokensService).criar('teste')).token;
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('o token tem o formato vmg_<id>_<segredo> e o banco guarda só o hash', async () => {
    expect(token).toMatch(/^vmg_[0-9a-f]{32}_[A-Za-z0-9_-]{43}$/);
    const [linha] = await ctx.db.query(`SELECT segredo_hash FROM token_mcp`);
    expect(linha.segredo_hash).toMatch(/^\$2[abxy]\$08\$/);
    expect(token).not.toContain(linha.segredo_hash);
  });

  it('o token vale por 6 meses', async () => {
    const [linha] = await ctx.db.query(
      `SELECT expira_em = criado_em + interval '6 months' AS seis_meses FROM token_mcp`,
    );
    expect(linha.seis_meses).toBe(true);
  });

  it('initialize e ping respondem com a versão do app (PV-1)', async () => {
    const init = await mcp(
      chamada(1, 'initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'teste', version: '1' },
      }),
    ).expect(200);
    expect(init.body.result.serverInfo).toMatchObject({ name: 'vermogen', version: expect.stringMatching(/^\d+\.\d+\.\d+$/) });

    const lista = await mcp(chamada(2, 'tools/list')).expect(200);
    expect(lista.body.result.tools.map((t: { name: string }) => t.name)).toEqual([
      'ping',
      'listar_contas',
      'listar_categorias',
      'criar_categoria',
      'listar_lotes',
      'consultar_transacoes',
      'listar_pendencias',
      'consultar_projecao',
      'importar_lote',
      'desfazer_lote',
      'resolver_pendencia',
      'registrar_lancamento',
    ]);

    const ping = await mcp(chamada(3, 'tools/call', { name: 'ping', arguments: {} })).expect(200);
    expect(ping.body.result.structuredContent).toEqual({ status: 'ok', versao: expect.stringMatching(/^\d+\.\d+\.\d+$/) });
  });

  it('listar_contas devolve as contas cadastradas', async () => {
    const cookie = await entrar(ctx);
    const inst = (await request(ctx.app.getHttpServer()).post('/api/instituicoes').set('Cookie', cookie).send({ nome: 'Nubank', cor: '#8A05BE' })).body;
    await request(ctx.app.getHttpServer())
      .post('/api/contas')
      .set('Cookie', cookie)
      .send({ instituicaoId: inst.id, nome: 'Cartão', tipo: 'cartao', finalidade: 'gasto', diaFechamento: 1, diaVencimento: 9 })
      .expect(201);
    const r = await mcp(chamada(1, 'tools/call', { name: 'listar_contas', arguments: {} })).expect(200);
    expect(r.body.result.structuredContent.contas[0]).toMatchObject({ nome: 'Cartão', tipo: 'cartao', instituicao: { nome: 'Nubank' } });
  });

  it('importar_lote pelo Claude: grava com origem e autor "claude"; erro de soma volta como erro da ferramenta', async () => {
    const cookie = await entrar(ctx);
    const http = request(ctx.app.getHttpServer());
    const inst = (await http.post('/api/instituicoes').set('Cookie', cookie).send({ nome: 'Inter', cor: '#FF9A3D' })).body;
    const conta = (await request(ctx.app.getHttpServer()).post('/api/contas').set('Cookie', cookie).send({ instituicaoId: inst.id, nome: 'Conta', tipo: 'corrente', finalidade: 'gasto' })).body;
    const lote = {
      contaId: conta.id,
      documento: 'Extrato Inter',
      periodo: { de: '2026-10-01', ate: '2026-10-31' },
      totalDeclarado: -59.9,
      itens: [
        { data: '2026-10-03', descricao: 'Padaria', valor: -12.5 },
        { data: '2026-10-04', descricao: 'Farmácia', valor: '-47.40' },
      ],
    };
    const errado = await mcp(chamada(1, 'tools/call', { name: 'importar_lote', arguments: { ...lote, totalDeclarado: -60 } })).expect(200);
    expect(errado.body.result.isError).toBe(true);
    expect(errado.body.result.content[0].text).toMatch(/Diferença: R\$ 0,10/);

    const certo = await mcp(chamada(2, 'tools/call', { name: 'importar_lote', arguments: lote })).expect(200);
    expect(certo.body.result.structuredContent).toMatchObject({ status: 'aceito', novas: 2 });
    const autores = await ctx.db.query(`SELECT DISTINCT autor FROM auditoria WHERE tabela IN ('transacao', 'importacao')`);
    expect(autores).toEqual([{ autor: 'claude' }]);
    const [{ origem }] = await ctx.db.query(`SELECT DISTINCT origem FROM transacao`);
    expect(origem).toBe('claude');

    const pend = await mcp(chamada(3, 'tools/call', { name: 'listar_pendencias', arguments: {} })).expect(200);
    expect(pend.body.result.structuredContent.semCategoria).toHaveLength(2);
    const consulta = await mcp(chamada(4, 'tools/call', { name: 'consultar_transacoes', arguments: { ciclo: '2026-10', limite: 1 } })).expect(200);
    expect(consulta.body.result.structuredContent).toMatchObject({ total: 2, soma: '-59.90' });
    expect(consulta.body.result.structuredContent.transacoes).toHaveLength(1);

    const desfazer = await mcp(chamada(5, 'tools/call', { name: 'desfazer_lote', arguments: { loteId: certo.body.result.structuredContent.loteId } })).expect(200);
    expect(desfazer.body.result.structuredContent.status).toBe('desfeito');
  });

  it('criar_categoria (PD-3): cria em dois níveis, com autor "claude"; nome repetido volta como erro', async () => {
    const pai = await mcp(chamada(1, 'tools/call', { name: 'criar_categoria', arguments: { nome: 'Moradia', natureza: 'intermitente' } })).expect(200);
    const moradia = pai.body.result.structuredContent.categoria;
    expect(moradia).toMatchObject({ nome: 'Moradia', paiId: null, natureza: 'intermitente', ativa: true });
    const sub = await mcp(chamada(2, 'tools/call', { name: 'criar_categoria', arguments: { nome: 'Aluguel', paiId: moradia.id } })).expect(200);
    expect(sub.body.result.structuredContent.categoria).toMatchObject({ nome: 'Aluguel', paiId: moradia.id });

    const repetida = await mcp(chamada(3, 'tools/call', { name: 'criar_categoria', arguments: { nome: 'moradia' } })).expect(200);
    expect(repetida.body.result.isError).toBe(true);
    expect(repetida.body.result.content[0].text).toMatch(/Já existe uma categoria/);
    const neta = await mcp(chamada(4, 'tools/call', { name: 'criar_categoria', arguments: { nome: 'Luz', paiId: sub.body.result.structuredContent.categoria.id } })).expect(200);
    expect(neta.body.result.isError).toBe(true);

    const autores = await ctx.db.query(`SELECT DISTINCT autor FROM auditoria WHERE tabela = 'categoria'`);
    expect(autores).toEqual([{ autor: 'claude' }]);
  });

  it('o MCP não tem ferramenta para alterar valor ou data', async () => {
    const lista = await mcp(chamada(1, 'tools/list')).expect(200);
    const nomes: string[] = lista.body.result.tools.map((t: { name: string }) => t.name);
    expect(nomes.some((n) => /alterar|editar|atualizar/.test(n))).toBe(false);
  });

  describe('sem token válido, 401', () => {
    it('sem cabeçalho, token inventado, formato errado', async () => {
      await request(ctx.app.getHttpServer()).post('/mcp').set('Accept', ACEITA).send(chamada(1, 'tools/list')).expect(401);
      await mcp(chamada(1, 'tools/list'), `vmg_${'0'.repeat(32)}_${'a'.repeat(43)}`).expect(401);
      await mcp(chamada(1, 'tools/list'), 'qualquer').expect(401);
      const outro = token.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'));
      await mcp(chamada(1, 'tools/list'), outro).expect(401);
    });

    it('token revogado', async () => {
      const [{ id }] = await ctx.db.query(`SELECT id FROM token_mcp`);
      expect(await ctx.app.get(TokensService).revogar(id)).toBe(true);
      await mcp(chamada(1, 'tools/list')).expect(401);
    });

    it('token expirado', async () => {
      await ctx.db.query(`UPDATE token_mcp SET expira_em = now() - interval '1 second'`);
      await mcp(chamada(1, 'tools/list')).expect(401);
    });

    it('o cookie de sessão do navegador não vale no MCP', async () => {
      const cookie = await entrar(ctx);
      await request(ctx.app.getHttpServer()).post('/mcp').set('Cookie', cookie).set('Accept', ACEITA).send(chamada(1, 'tools/list')).expect(401);
    });

    it('o token do MCP não vale na API da tela', async () => {
      await request(ctx.app.getHttpServer()).get('/api/contas').set('Authorization', `Bearer ${token}`).expect(401);
    });
  });

  it('GET em /mcp responde 405 (transporte sem sessão)', async () => {
    await request(ctx.app.getHttpServer()).get('/mcp').set('Authorization', `Bearer ${token}`).expect(405);
  });
});
