import { diaDaSemana, ehData, hoje, somarDias, somarMeses, ultimoDiaDoMes } from './datas.js';

describe('datas', () => {
  it('reconhece datas válidas e recusa as impossíveis', () => {
    expect(ehData('2026-11-30')).toBe(true);
    expect(ehData('2028-02-29')).toBe(true);
    for (const v of ['2026-11-31', '2027-02-29', '2026-13-01', '2026-1-01', '30/11/2026', 20261130]) {
      expect(ehData(v)).toBe(false);
    }
  });

  it('soma dias atravessando mês e ano', () => {
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('dia da semana', () => {
    expect(diaDaSemana('2026-10-31')).toBe(6); // sábado
    expect(diaDaSemana('2026-11-07')).toBe(6); // sábado
    expect(diaDaSemana('2026-11-30')).toBe(1); // segunda
  });

  it('último dia do mês e soma de meses', () => {
    expect(ultimoDiaDoMes(2026, 11)).toBe(30);
    expect(ultimoDiaDoMes(2028, 2)).toBe(29);
    expect(somarMeses(2026, 12, 1)).toEqual([2027, 1]);
    expect(somarMeses(2027, 1, -1)).toEqual([2026, 12]);
  });

  it('hoje usa o fuso de São Paulo', () => {
    // 02:00 UTC de 15/11 ainda é 23:00 de 14/11 em São Paulo.
    expect(hoje(new Date('2026-11-15T02:00:00Z'))).toBe('2026-11-14');
  });
});
