import type { DatasReais } from '../calendario/regras.js';
import {
  type Cartao,
  type EntradaDaProjecao,
  type Movimento,
  type ParcelaGravada,
  chaveDaCompraParcelada,
  parcelasFuturas,
  projetar,
  veredito,
} from './regras.js';

const SEM_REAIS: DatasReais = new Map();
const MP: Cartao = { id: 'mp', nome: 'Cartão', instituicao: 'Mercado Pago', cor: '#00B1EA', dias: { diaFechamento: 29, diaVencimento: 4 } };
const INTER: Cartao = { id: 'inter', nome: 'Cartão', instituicao: 'Inter', cor: '#FF9A3D', dias: { diaFechamento: 31, diaVencimento: 7 } };
const NU: Cartao = { id: 'nu', nome: 'Cartão', instituicao: 'Nubank', cor: '#8A05BE', dias: { diaFechamento: 1, diaVencimento: 9 } };

function mov(extra: Partial<Movimento>): Movimento {
  return {
    contaId: 'corrente',
    cartao: false,
    faturaId: null,
    dataCompra: '2026-10-10',
    dataPagamento: extra.dataCompra ?? '2026-10-10',
    centavos: -1000,
    tipo: 'despesa',
    compensa: false,
    categoriaId: null,
    categoriaNome: null,
    natureza: null,
    parcela: null,
    descricao: 'Compra',
    ...extra,
  };
}

function entrada(extra: Partial<EntradaDaProjecao> = {}): EntradaDaProjecao {
  return {
    hoje: '2026-10-30',
    reais: SEM_REAIS,
    cicloAtual: '2026-11',
    horizonte: 12,
    parametros: () => ({ salario: 460000, aportePercentual: 10, orcamentoFlexiveis: 142000, folgaMinima: 30000 }),
    planos: new Map(),
    cartoes: [],
    faturas: [],
    movimentos: [],
    parcelas: [],
    intermitentes: [],
    valoresFixos: [],
    ...extra,
  };
}

describe('projeção (HU-15)', () => {
  it('CA2: resultado = receita − dízimo − faturas − fixas − aporte, para 12 ciclos (RN-06)', () => {
    const r = projetar(entrada());
    expect(r.ciclos).toHaveLength(12);
    expect(r.ciclos.map((c) => c.ciclo.id).slice(0, 3)).toEqual(['2026-11', '2026-12', '2027-01']);
    const nov = r.ciclos[0]!;
    expect(nov).toMatchObject({ receita: 460000, dizimo: -46000, aporte: -46000, orcamentoFlexiveis: 142000 });
    // Sem cartão, o orçamento de flexíveis do ciclo anterior entra inteiro.
    expect(nov.totais.faturas).toBe(-142000);
    expect(nov.resultadoLiquido).toBe(460000 - 46000 - 142000 - 46000);
    expect(nov.veredito).toBe('positivo');
  });

  it('sem salário configurado, a receita é zero e o veredito sai negativo', () => {
    const r = projetar(entrada({ parametros: () => ({ salario: null, aportePercentual: 10, orcamentoFlexiveis: 0, folgaMinima: 30000 }) }));
    expect(r.ciclos[0]).toMatchObject({ receita: 0, dizimo: -0, aporte: -0, resultadoLiquido: 0, veredito: 'moderado' });
  });

  it('RN-16: positivo a partir da folga, moderado até zero, negativo abaixo', () => {
    expect(veredito(30000, 30000)).toBe('positivo');
    expect(veredito(0, 30000)).toBe('moderado');
    expect(veredito(-1, 30000)).toBe('negativo');
  });

  describe('faturas (RN-08, RN-11, E-04)', () => {
    const dados = entrada({
      cartoes: [MP, INTER, NU],
      faturas: [{ id: 'f-mp-nov', contaId: 'mp', fechamento: '2026-10-29', vencimento: '2026-11-04' }],
      movimentos: [
        mov({ contaId: 'mp', cartao: true, faturaId: 'f-mp-nov', dataCompra: '2026-10-05', dataPagamento: '2026-11-04', centavos: -20000, categoriaNome: 'Combustível' }),
        mov({ contaId: 'mp', cartao: true, faturaId: 'f-mp-nov', dataCompra: '2026-10-06', dataPagamento: '2026-11-04', centavos: -11200, categoriaNome: 'Farmácia' }),
        // O pagamento da fatura não entra na soma dela.
        mov({ contaId: 'mp', cartao: true, faturaId: 'f-mp-nov', dataCompra: '2026-10-20', dataPagamento: '2026-11-04', centavos: 50000, tipo: 'pagamento_fatura' }),
      ],
    });

    it('fechada e importada: vale o valor real; ainda aberta: projetada', () => {
      const nov = projetar(dados).ciclos[0]!;
      const porBanco = Object.fromEntries(nov.faturas.map((f) => [f.cartao.instituicao, f]));
      expect(porBanco['Mercado Pago']).toMatchObject({ status: 'fechada', centavos: -31200, realizado: -31200, vencimento: '2026-11-04' });
      // Inter fecha em 31/10 e vence em 07/11 (sábado) → 09/11 (RN-09); Nubank fecha 01/11, vence 09/11.
      expect(porBanco['Inter']).toMatchObject({ status: 'projetada', fechamento: '2026-10-31', vencimento: '2026-11-09' });
      expect(porBanco['Nubank']).toMatchObject({ status: 'projetada', fechamento: '2026-11-01', vencimento: '2026-11-09' });
      expect(porBanco['Mercado Pago']!.itens.map((i) => i.descricao)).toEqual(['Combustível', 'Farmácia']);
    });

    it('já fechada mas sem documento: "a importar", com a estimativa', () => {
      const nov = projetar({ ...dados, hoje: '2026-11-02' }).ciclos[0]!;
      expect(nov.faturas.find((f) => f.cartao.id === 'nu')).toMatchObject({ status: 'a_importar' });
    });

    it('fatura gravada com vencimento do documento diferente do calculado não é contada duas vezes', () => {
      const nov = projetar({
        ...dados,
        faturas: [...dados.faturas, { id: 'f-nu', contaId: 'nu', fechamento: '2026-11-01', vencimento: '2026-11-10' }],
      }).ciclos[0]!;
      expect(nov.faturas.filter((f) => f.cartao.id === 'nu')).toHaveLength(1);
    });
  });

  describe('orçamento de flexíveis (RN-11, DM-27)', () => {
    it('o que sobrou do orçamento do ciclo anterior é pago nas faturas deste ciclo', () => {
      const r = projetar(
        entrada({
          cartoes: [NU],
          hoje: '2026-11-05',
          movimentos: [
            mov({ dataCompra: '2026-10-10', centavos: -38000, natureza: 'flexivel' }), // outubro
            mov({ dataCompra: '2026-11-03', centavos: -12000, natureza: 'flexivel' }), // novembro
            mov({ dataCompra: '2026-11-03', centavos: -9000, natureza: 'intermitente', categoriaId: 'luz' }), // não é flexível
            mov({ dataCompra: '2026-11-04', centavos: -29000, parcela: { numero: 1, total: 3 } }), // parcela não é flexível
          ],
        }),
      );
      expect(r.ciclos[0]!.flexiveisNosCartoes).toEqual({ centavos: -104000, orcamentoDoCicloAnterior: 142000, gastoNoCicloAnterior: 38000 });
      expect(r.ciclos[1]!.flexiveisNosCartoes.centavos).toBe(-(142000 - 12000));
      expect(r.livreParaGastar).toEqual({ orcamento: 142000, usado: 12000, livre: 130000 });
    });

    it('quando todas as faturas do ciclo já fecharam, o orçamento já está nelas', () => {
      const r = projetar(
        entrada({
          cartoes: [MP],
          hoje: '2026-11-02',
          faturas: [{ id: 'f', contaId: 'mp', fechamento: '2026-10-29', vencimento: '2026-11-04' }],
          movimentos: [mov({ contaId: 'mp', cartao: true, faturaId: 'f', dataCompra: '2026-10-10', dataPagamento: '2026-11-04', centavos: -50000, natureza: 'flexivel' })],
        }),
      );
      expect(r.ciclos[0]!.flexiveisNosCartoes.centavos).toBe(0);
      expect(r.ciclos[0]!.totais.faturas).toBe(-50000);
    });

    it('o plano da abertura troca aporte e orçamento do ciclo', () => {
      const r = projetar(entrada({ planos: new Map([['2026-11', { aporte: 30000, orcamentoFlexiveis: 100000 }]]) }));
      expect(r.ciclos[0]).toMatchObject({ aporte: -30000, orcamentoFlexiveis: 100000, ajustado: true });
      expect(r.ciclos[1]!.flexiveisNosCartoes.orcamentoDoCicloAnterior).toBe(100000);
      expect(r.ciclos[1]!.ajustado).toBe(false);
    });
  });

  describe('fixas e intermitentes (RN-10)', () => {
    const luz = { id: 'luz', nome: 'Luz' };
    const historico = [
      mov({ dataCompra: '2026-08-12', centavos: -15000, categoriaId: 'luz', natureza: 'intermitente' }),
      mov({ dataCompra: '2026-09-12', centavos: -18600, categoriaId: 'luz', natureza: 'intermitente' }),
      mov({ dataCompra: '2026-10-12', centavos: -17000, categoriaId: 'luz', natureza: 'intermitente' }),
    ];

    it('maior dos últimos 3 ciclos, com o histórico', () => {
      const nov = projetar(entrada({ intermitentes: [luz], movimentos: historico })).ciclos[0]!;
      expect(nov.fixas).toEqual([
        {
          descricao: 'Luz',
          categoriaId: 'luz',
          centavos: -18600,
          base: 'maior_3',
          historico: [
            { ciclo: '2026-08', centavos: 15000 },
            { ciclo: '2026-09', centavos: 18600 },
            { ciclo: '2026-10', centavos: 17000 },
          ],
        },
      ]);
    });

    it('valor fixado prevalece a partir do ciclo escolhido; null volta ao cálculo', () => {
      const r = projetar(
        entrada({
          intermitentes: [luz],
          movimentos: historico,
          valoresFixos: [
            { categoriaId: 'luz', aPartirDe: '2026-12', centavos: 20000 },
            { categoriaId: 'luz', aPartirDe: '2027-02', centavos: null },
          ],
        }),
      );
      expect(r.ciclos.slice(0, 4).map((c) => [c.fixas[0]!.base, c.fixas[0]!.centavos])).toEqual([
        ['maior_3', -18600],
        ['fixo', -20000],
        ['fixo', -20000],
        ['maior_3', -18600],
      ]);
    });

    it('o já gravado no ciclo vale se passar da estimativa', () => {
      const nov = projetar(
        entrada({ intermitentes: [luz], movimentos: [...historico, mov({ dataCompra: '2026-11-12', centavos: -25000, categoriaId: 'luz', natureza: 'intermitente' })] }),
      ).ciclos[0]!;
      expect(nov.fixas[0]).toMatchObject({ centavos: -25000, base: 'realizado' });
    });

    it('D3: a metade paga pela mãe (fora das contas) abate da faculdade', () => {
      const faculdade = { id: 'fac', nome: 'Faculdade' };
      const nov = projetar(
        entrada({
          intermitentes: [faculdade],
          movimentos: [
            mov({ dataCompra: '2026-10-10', centavos: -107000, categoriaId: 'fac', natureza: 'intermitente' }),
            mov({ contaId: null, dataCompra: '2026-10-10', centavos: 53500, tipo: 'receita_fora_das_contas', compensa: true, categoriaId: 'fac', natureza: 'intermitente' }),
          ],
        }),
      ).ciclos[0]!;
      expect(nov.fixas[0]!.centavos).toBe(-53500);
    });

    it('fixa paga no cartão entra na estimativa da fatura, não nas fixas', () => {
      const streaming = { id: 'str', nome: 'Streaming' };
      const nov = projetar(
        entrada({
          cartoes: [NU],
          intermitentes: [streaming],
          faturas: [{ id: 'f-out', contaId: 'nu', fechamento: '2026-10-01', vencimento: '2026-10-09' }],
          movimentos: [
            mov({ contaId: 'nu', cartao: true, faturaId: 'f-out', dataCompra: '2026-09-20', dataPagamento: '2026-10-09', centavos: -5990, categoriaId: 'str', categoriaNome: 'Streaming', natureza: 'intermitente' }),
          ],
        }),
      ).ciclos[0]!;
      expect(nov.fixas).toEqual([]);
      const nubank = nov.faturas.find((f) => f.cartao.id === 'nu')!;
      expect(nubank.itens).toContainEqual({ descricao: 'Streaming', centavos: -5990, origem: 'recorrente' });
      expect(nubank.centavos).toBe(-5990);
    });
  });

  describe('parcelas futuras (DM-25)', () => {
    const celular: ParcelaGravada = {
      contaId: 'nu',
      cartao: NU.dias,
      fechamento: '2026-10-01',
      dataPagamento: '2026-10-09',
      centavos: -38900,
      numero: 4,
      total: 6,
      descricao: 'CELULAR PARC 04/06',
    };

    it('a mesma compra é reconhecida com o "n/N" escrito de formas diferentes', () => {
      expect(chaveDaCompraParcelada({ ...celular, descricao: 'Celular parcela 4/6' })).toBe(chaveDaCompraParcelada(celular));
      expect(chaveDaCompraParcelada({ ...celular, descricao: 'CELULAR 5 de 6' })).toBe(chaveDaCompraParcelada(celular));
    });

    it('no cartão, uma parcela por fatura seguinte, até a última', () => {
      expect(parcelasFuturas([celular], '2027-12-31')).toEqual([
        expect.objectContaining({ numero: 5, dataPagamento: '2026-11-09', centavos: -38900 }),
        expect.objectContaining({ numero: 6, dataPagamento: '2026-12-09' }),
      ]);
    });

    it('parte da última parcela gravada; compra já quitada não gera nada', () => {
      const quinta = { ...celular, numero: 5, fechamento: '2026-11-01', dataPagamento: '2026-11-09', descricao: 'CELULAR PARC 05/06' };
      expect(parcelasFuturas([celular, quinta], '2027-12-31').map((p) => p.numero)).toEqual([6]);
      const sexta = { ...celular, numero: 6, fechamento: '2026-12-01', dataPagamento: '2026-12-09' };
      expect(parcelasFuturas([celular, quinta, sexta], '2027-12-31')).toEqual([]);
    });

    it('duas compras iguais na mesma fatura seguem separadas', () => {
      expect(parcelasFuturas([celular, { ...celular }], '2027-12-31')).toHaveLength(4);
    });

    it('fora do cartão, uma por mês, no mesmo dia', () => {
      const boleto: ParcelaGravada = { ...celular, contaId: 'corrente', cartao: null, fechamento: null, dataPagamento: '2026-10-31', numero: 1, total: 3 };
      expect(parcelasFuturas([boleto], '2027-12-31').map((p) => p.dataPagamento)).toEqual(['2026-11-30', '2026-12-31']);
    });

    it('entram na fatura do ciclo em que vencem', () => {
      const r = projetar(entrada({ cartoes: [NU], parcelas: [celular] }));
      const nubank = (i: number) => r.ciclos[i]!.faturas.find((f) => f.cartao.id === 'nu')!;
      expect(nubank(0).itens).toContainEqual({ descricao: 'CELULAR PARC 04/06 · parcela 5/6', centavos: -38900, origem: 'parcela' });
      expect(nubank(1).centavos).toBe(-38900);
      expect(nubank(2).centavos).toBe(0);
    });
  });
});
