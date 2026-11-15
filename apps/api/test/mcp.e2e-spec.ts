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
    expect(lista.body.result.tools.map((t: { name: string }) => t.name)).toEqual(['ping', 'listar_contas']);

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
