import request from 'supertest';
import { CadastrosService } from '../src/cadastros/cadastros.service.js';
import { CONFIGURACAO_INICIAL, cadastrarConfiguracaoInicial } from '../src/cadastros/configuracao-inicial.js';
import { type Contexto, entrar, reiniciarDados, subirApp } from './apoio.js';

describe('cadastros (HU-03 a HU-05)', () => {
  let ctx: Contexto;
  let cookie: string;
  const api = () => request(ctx.app.getHttpServer());
  const get = (url: string) => api().get(url).set('Cookie', cookie);
  const post = (url: string, corpo: object) => api().post(url).set('Cookie', cookie).send(corpo);
  const patch = (url: string, corpo: object) => api().patch(url).set('Cookie', cookie).send(corpo);

  async function instituicao(nome = 'Nubank', cor = '#8a05be') {
    return (await post('/api/instituicoes', { nome, cor }).expect(201)).body;
  }

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

  describe('HU-03 — instituições', () => {
    it('cadastra com nome e cor (cor normalizada em maiúsculas)', async () => {
      const inst = await instituicao();
      expect(inst).toMatchObject({ nome: 'Nubank', cor: '#8A05BE', ativa: true });
    });

    it('recusa cor inválida e nome repetido', async () => {
      await post('/api/instituicoes', { nome: 'X', cor: 'roxo' }).expect(400);
      await instituicao();
      const r = await post('/api/instituicoes', { nome: 'nubank', cor: '#000000' }).expect(409);
      expect(r.body.message).toMatch(/instituição com esse nome/);
    });

    it('CA1: a cor da instituição vem junto de cada conta, para a faixa lateral (DS-06)', async () => {
      const inst = await instituicao();
      await post('/api/contas', { instituicaoId: inst.id, nome: 'Cartão', tipo: 'cartao', finalidade: 'gasto', diaFechamento: 1, diaVencimento: 9 }).expect(201);
      const [conta] = (await get('/api/contas').expect(200)).body;
      expect(conta.instituicao).toEqual({ id: inst.id, nome: 'Nubank', cor: '#8A05BE', ativa: true });
    });

    it('CA2: desativar não apaga a instituição nem as contas', async () => {
      const inst = await instituicao();
      await post('/api/contas', { instituicaoId: inst.id, nome: 'Cartão', tipo: 'cartao', finalidade: 'gasto', diaFechamento: 1, diaVencimento: 9 }).expect(201);
      const desativada = (await patch(`/api/instituicoes/${inst.id}`, { ativa: false }).expect(200)).body;
      expect(desativada).toEqual({ id: inst.id, nome: 'Nubank', cor: '#8A05BE', ativa: false });
      await patch('/api/instituicoes/00000000-0000-0000-0000-000000000000', { ativa: false }).expect(404);

      expect((await get('/api/instituicoes').expect(200)).body).toHaveLength(0);
      expect((await get('/api/contas').expect(200)).body).toHaveLength(0);
      const todas = (await get('/api/contas?incluirInativas=true').expect(200)).body;
      expect(todas).toHaveLength(1);
      expect(todas[0].instituicao.ativa).toBe(false);
      expect((await get('/api/instituicoes?incluirInativas=true').expect(200)).body[0].ativa).toBe(false);
      // Não existe rota de exclusão.
      await api().delete(`/api/instituicoes/${inst.id}`).set('Cookie', cookie).expect(404);
    });
  });

  describe('HU-04 — contas com tipo e finalidade com vigência', () => {
    it('CA2: as 9 contas da configuração inicial podem ser cadastradas', async () => {
      const servico = ctx.app.get(CadastrosService);
      expect(await cadastrarConfiguracaoInicial(servico)).toBe(9);
      const contas = (await get('/api/contas').expect(200)).body;
      expect(contas).toHaveLength(9);
      const resumo = contas.map((c: { instituicao: { nome: string }; nome: string; tipo: string; finalidade: { atual: string } }) =>
        `${c.instituicao.nome}/${c.nome}/${c.tipo}/${c.finalidade.atual}`,
      );
      expect(resumo).toEqual(
        expect.arrayContaining([
          'Itaú/Conta corrente/corrente/recebimento',
          'Mercado Pago/Reserva/investimento/reserva',
          'Flash/Premiação/uso_restrito/gasto',
        ]),
      );
      expect(CONFIGURACAO_INICIAL.flatMap((i) => i.contas)).toHaveLength(9);
      // Só roda com cadastro vazio.
      await expect(cadastrarConfiguracaoInicial(servico)).rejects.toThrow(/cadastro vazio/);
    });

    it('CA1: mudar a finalidade cria nova vigência e não altera o passado (RN-14)', async () => {
      const inst = await instituicao('Mercado Pago', '#00B1EA');
      const conta = (await post('/api/contas', { instituicaoId: inst.id, nome: 'Reserva', tipo: 'investimento', finalidade: 'reserva' }).expect(201)).body;
      const historico = (await post(`/api/contas/${conta.id}/finalidades`, { finalidade: 'investimento', vigenteDe: '2027-03-16' }).expect(201)).body;

      expect(historico).toEqual([
        { id: expect.any(String), finalidade: 'investimento', vigenteDe: '2027-03-16', vigenteAte: null },
        { id: expect.any(String), finalidade: 'reserva', vigenteDe: '2000-01-01', vigenteAte: '2027-03-15' },
      ]);
      const servico = ctx.app.get(CadastrosService);
      expect(await servico.finalidadeEm(conta.id, '2027-03-15')).toBe('reserva');
      expect(await servico.finalidadeEm(conta.id, '2027-03-16')).toBe('investimento');
    });

    it('recusa vigência que reescreveria o passado ou finalidade igual', async () => {
      const inst = await instituicao('Inter', '#FF9A3D');
      const conta = (await post('/api/contas', { instituicaoId: inst.id, nome: 'CDB', tipo: 'investimento', finalidade: 'investimento', finalidadeDesde: '2026-01-01' }).expect(201)).body;
      await post(`/api/contas/${conta.id}/finalidades`, { finalidade: 'reserva', vigenteDe: '2026-01-01' }).expect(400);
      await post(`/api/contas/${conta.id}/finalidades`, { finalidade: 'investimento', vigenteDe: '2026-06-01' }).expect(400);
    });

    it('o banco impede duas finalidades vigentes na mesma data', async () => {
      const inst = await instituicao();
      const conta = (await post('/api/contas', { instituicaoId: inst.id, nome: 'Conta', tipo: 'corrente', finalidade: 'gasto' }).expect(201)).body;
      await expect(
        ctx.db.transaction(async (m) => {
          await m.query(`SELECT set_config('vermogen.autor', 'sistema', true)`);
          await m.query(`INSERT INTO conta_finalidade (conta_id, finalidade, vigente_de) VALUES ($1, 'reserva', '2026-05-01')`, [conta.id]);
        }),
      ).rejects.toThrow(/conta_finalidade_sem_sobreposicao/);
    });

    it('o tipo não muda depois do cadastro', async () => {
      const inst = await instituicao();
      const conta = (await post('/api/contas', { instituicaoId: inst.id, nome: 'Conta', tipo: 'corrente', finalidade: 'gasto' }).expect(201)).body;
      await patch(`/api/contas/${conta.id}`, { tipo: 'cartao' }).expect(400);
    });
  });

  describe('HU-05 — dias de fechamento e vencimento do cartão', () => {
    it('CA1: aceita de 1 a 31 e recusa fora disso', async () => {
      const inst = await instituicao();
      const base = { instituicaoId: inst.id, tipo: 'cartao', finalidade: 'gasto' };
      await post('/api/contas', { ...base, nome: 'A', diaFechamento: 31, diaVencimento: 1 }).expect(201);
      await post('/api/contas', { ...base, nome: 'B', diaFechamento: 0, diaVencimento: 9 }).expect(400);
      await post('/api/contas', { ...base, nome: 'C', diaFechamento: 1, diaVencimento: 32 }).expect(400);
      await post('/api/contas', { ...base, nome: 'D', diaFechamento: 1.5, diaVencimento: 9 }).expect(400);
    });

    it('cartão exige os dois dias; outra conta não aceita nenhum', async () => {
      const inst = await instituicao();
      await post('/api/contas', { instituicaoId: inst.id, nome: 'A', tipo: 'cartao', finalidade: 'gasto', diaFechamento: 1 }).expect(400);
      await post('/api/contas', { instituicaoId: inst.id, nome: 'B', tipo: 'corrente', finalidade: 'gasto', diaFechamento: 1, diaVencimento: 9 }).expect(400);
    });

    it('CA2: fechamento no dia 31 num mês de 30 dias vai para o dia 30 (RN-09)', async () => {
      const inst = await instituicao('Inter', '#FF9A3D');
      const cartao = (await post('/api/contas', { instituicaoId: inst.id, nome: 'Cartão', tipo: 'cartao', finalidade: 'gasto', diaFechamento: 31, diaVencimento: 7 }).expect(201)).body;
      const fatura = (await get(`/api/contas/${cartao.id}/fatura?compra=2026-11-15`).expect(200)).body;
      expect(fatura).toEqual({ fechamento: '2026-11-30', vencimento: '2026-12-07', ciclo: '2026-12' });
      expect(cartao.cartao.proximaFatura).toEqual(expect.objectContaining({ ciclo: expect.stringMatching(/^\d{4}-\d{2}$/) }));
    });

    it('mudar os dias do cartão vale para as próximas consultas', async () => {
      const inst = await instituicao();
      const cartao = (await post('/api/contas', { instituicaoId: inst.id, nome: 'Cartão', tipo: 'cartao', finalidade: 'gasto', diaFechamento: 1, diaVencimento: 9 }).expect(201)).body;
      await patch(`/api/contas/${cartao.id}`, { diaFechamento: 5, diaVencimento: 12 }).expect(200);
      const fatura = (await get(`/api/contas/${cartao.id}/fatura?compra=2026-11-02`).expect(200)).body;
      expect(fatura.fechamento).toBe('2026-11-05');
    });
  });
});
