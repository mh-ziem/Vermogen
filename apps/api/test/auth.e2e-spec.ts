import request from 'supertest';
import { type Contexto, SENHA, cookieDe, reiniciarDados, subirApp } from './apoio.js';

describe('HU-01 — login e sessão', () => {
  let ctx: Contexto;
  const http = () => request(ctx.app.getHttpServer());
  const entrar = async () => cookieDe(await http().post('/api/auth/login').send({ senha: SENHA }).expect(200));

  beforeAll(async () => {
    ctx = await subirApp();
  });
  beforeEach(async () => {
    // App novo a cada teste zeraria o limite de tentativas; aqui basta um login certo para zerar.
    await reiniciarDados(ctx.db);
    await http().post('/api/auth/login').send({ senha: SENHA });
    await ctx.db.query(`DELETE FROM sessao`);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  describe('CA1 — sem credencial, toda rota de dados responde 401', () => {
    const rotas: [string, string][] = [
      ['get', '/api/auth/sessao'],
      ['post', '/api/auth/logout'],
      ['get', '/api'],
      ['get', '/api/rota-que-nao-existe'],
      ['post', '/api/transacoes'],
      ['delete', '/api/qualquer/coisa'],
      ['get', '/API/auth/sessao'],
      ['get', '/api/auth/sessao/'],
      ['post', '/mcp'],
      ['get', '/mcp/qualquer'],
    ];
    it.each(rotas)('%s %s → 401', async (metodo, caminho) => {
      const resposta = await (http() as unknown as Record<string, (c: string) => request.Test>)[metodo]!(caminho);
      expect(resposta.status).toBe(401);
    });

    it('cookie inventado → 401', async () => {
      await http().get('/api/auth/sessao').set('Cookie', 'vermogen_sessao=inventado').expect(401);
    });

    it('as únicas rotas públicas são o login e o health (SAD DT-11)', async () => {
      const saude = await http().get('/api/health').expect(200);
      expect(saude.body).toEqual({ status: 'ok', versao: expect.stringMatching(/^\d+\.\d+\.\d+$/) });
      await http().post('/api/auth/login').send({ senha: 'errada' }).expect(401);
      // Só os métodos listados são públicos.
      await http().post('/api/health').expect(401);
      await http().get('/api/auth/login').expect(401);
    });
  });

  describe('login', () => {
    it('senha certa → cookie de sessão HttpOnly, SameSite=Strict, 30 dias', async () => {
      const resposta = await http().post('/api/auth/login').send({ senha: SENHA }).expect(200);
      const cookie = (resposta.headers['set-cookie'] as unknown as string[])[0]!;
      expect(cookie).toMatch(/^vermogen_sessao=[\w-]{43};/);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Max-Age=2592000');
      expect(resposta.body.usuario).toBe('matheus');
    });

    it('com a sessão, a rota protegida responde', async () => {
      const cookie = await entrar();
      const resposta = await http().get('/api/auth/sessao').set('Cookie', cookie).expect(200);
      expect(resposta.body.usuario).toBe('matheus');
    });

    it('senha errada → 401 e nenhum cookie', async () => {
      const resposta = await http().post('/api/auth/login').send({ senha: 'errada' }).expect(401);
      expect(resposta.headers['set-cookie']).toBeUndefined();
    });

    it('corpo sem senha → 400', async () => {
      await http().post('/api/auth/login').send({}).expect(400);
      await http().post('/api/auth/login').send({ senha: 123 }).expect(400);
    });

    it('5 senhas erradas bloqueiam novas tentativas, mesmo com a senha certa (SAD DT-11)', async () => {
      for (let i = 0; i < 5; i++) await http().post('/api/auth/login').send({ senha: 'errada' }).expect(401);
      const resposta = await http().post('/api/auth/login').send({ senha: SENHA }).expect(429);
      expect(Number(resposta.headers['retry-after'])).toBeGreaterThan(0);
      // Recria o app para o próximo teste começar sem bloqueio.
      await ctx.app.close();
      ctx = await subirApp();
    });
  });

  describe('CA2 — a sessão expira em 30 dias', () => {
    it('é criada com validade de 30 dias', async () => {
      await entrar();
      const [linha] = await ctx.db.query(
        `SELECT round(extract(epoch FROM (expira_em - criado_em)) / 86400) AS dias FROM sessao`,
      );
      expect(Number(linha.dias)).toBe(30);
    });

    it('depois de expirada, responde 401', async () => {
      const cookie = await entrar();
      await ctx.db.query(`UPDATE sessao SET expira_em = now() - interval '1 second'`);
      await http().get('/api/auth/sessao').set('Cookie', cookie).expect(401);
    });

    it('um dia antes de expirar, ainda vale', async () => {
      const cookie = await entrar();
      await ctx.db.query(`UPDATE sessao SET expira_em = now() + interval '1 day'`);
      await http().get('/api/auth/sessao').set('Cookie', cookie).expect(200);
    });
  });

  describe('CA3 — senha guardada com crypt() + gen_salt(bf)', () => {
    it('o banco guarda um hash bcrypt, nunca a senha', async () => {
      const [linha] = await ctx.db.query(`SELECT senha_hash FROM usuario WHERE nome = 'matheus'`);
      expect(linha.senha_hash).toMatch(/^\$2[abxy]\$\d{2}\$.{53}$/);
      expect(linha.senha_hash).not.toContain(SENHA);
    });

    it('o banco guarda só o hash do identificador da sessão', async () => {
      const cookie = await entrar();
      const token = cookie.split('=')[1]!;
      const [linha] = await ctx.db.query(`SELECT encode(token_hash, 'hex') AS hash FROM sessao`);
      expect(linha.hash).toHaveLength(64);
      expect(linha.hash).not.toContain(token);
    });
  });

  describe('sair', () => {
    it('encerra a sessão: o mesmo cookie deixa de valer', async () => {
      const cookie = await entrar();
      await http().post('/api/auth/logout').set('Cookie', cookie).expect(204);
      await http().get('/api/auth/sessao').set('Cookie', cookie).expect(401);
    });

    it('cada dispositivo tem a sua sessão: sair de um não derruba o outro', async () => {
      const celular = await entrar();
      const desktop = await entrar();
      await http().post('/api/auth/logout').set('Cookie', celular).expect(204);
      await http().get('/api/auth/sessao').set('Cookie', desktop).expect(200);
    });
  });
});
