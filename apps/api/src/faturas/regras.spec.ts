import { faturaDaCompra, fechamentoDaCompra, vencimentoDaFatura } from './regras.js';

const NUBANK = { diaFechamento: 1, diaVencimento: 9 };
const INTER = { diaFechamento: 31, diaVencimento: 7 };
const MERCADO_PAGO = { diaFechamento: 29, diaVencimento: 4 };

describe('HU-07 — compra no cartão → fatura → ciclo (RN-08, RN-09)', () => {
  it('CA1: Nubank, compra em 30/10/26 → fecha 01/11, vence 09/11 → ciclo Novembro', () => {
    expect(faturaDaCompra('2026-10-30', NUBANK)).toEqual({
      fechamento: '2026-11-01',
      vencimento: '2026-11-09',
      ciclo: '2026-11',
    });
  });

  it('CA2: Inter, compra em 15/11/26 → fecha 30/11 (RN-09) → vence 07/12 → ciclo Dezembro', () => {
    expect(faturaDaCompra('2026-11-15', INTER)).toEqual({
      fechamento: '2026-11-30',
      vencimento: '2026-12-07',
      ciclo: '2026-12',
    });
  });

  it('CA3: vencimento em 07/11/26 (sábado) passa para 09/11', () => {
    expect(vencimentoDaFatura('2026-10-31', INTER)).toBe('2026-11-09');
  });

  it('Mercado Pago: fecha dia 29 do mês anterior e vence dia 04', () => {
    expect(faturaDaCompra('2026-10-20', MERCADO_PAGO)).toEqual({
      fechamento: '2026-10-29',
      vencimento: '2026-11-04',
      ciclo: '2026-11',
    });
  });

  it('compra no próprio dia do fechamento entra na fatura seguinte (DM-12)', () => {
    expect(fechamentoDaCompra('2026-11-01', NUBANK)).toBe('2026-12-01');
    expect(fechamentoDaCompra('2026-10-31', NUBANK)).toBe('2026-11-01');
  });

  it('fechamento no dia 31 em fevereiro vai para o último dia do mês', () => {
    expect(fechamentoDaCompra('2027-02-10', INTER)).toBe('2027-02-28');
    expect(fechamentoDaCompra('2028-02-10', INTER)).toBe('2028-02-29');
  });

  it('vencimento num feriado vai para o próximo dia útil', () => {
    // Fechamento 29/11/26 → vencimento nominal 04/12 (sexta, útil).
    expect(vencimentoDaFatura('2026-11-29', MERCADO_PAGO)).toBe('2026-12-04');
    // Vencimento nominal no dia 2 de novembro (Finados) vai para 03/11.
    expect(vencimentoDaFatura('2026-10-25', { diaFechamento: 25, diaVencimento: 2 })).toBe('2026-11-03');
  });

  it('vencimento de dezembro na virada do ano: 31/12 sem expediente → próximo dia útil', () => {
    expect(vencimentoDaFatura('2026-12-20', { diaFechamento: 20, diaVencimento: 31 })).toBe('2027-01-04');
  });

  it('a data real do salário muda o ciclo em que a fatura é paga (RN-04)', () => {
    const reais = new Map([['2026-12', '2026-12-10']]);
    expect(faturaDaCompra('2026-11-15', INTER, reais).ciclo).toBe('2026-11');
  });

  it('recusa dia fora de 1 a 31 (HU-05 CA1)', () => {
    expect(() => faturaDaCompra('2026-11-15', { diaFechamento: 0, diaVencimento: 7 })).toThrow(/1 a 31/);
    expect(() => faturaDaCompra('2026-11-15', { diaFechamento: 5, diaVencimento: 32 })).toThrow(/1 a 31/);
  });
});
