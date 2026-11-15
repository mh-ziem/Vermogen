import { deCentavos, emReais, paraCentavos } from './dinheiro.js';

describe('dinheiro em centavos', () => {
  it('converte número e texto sem erro de ponto flutuante', () => {
    expect(paraCentavos(0.1 + 0.2)).toBe(30);
    expect(paraCentavos(-47.9)).toBe(-4790);
    expect(paraCentavos('1146.00')).toBe(114600);
    expect(paraCentavos('-0.05')).toBe(-5);
    expect(paraCentavos(1234567.89)).toBe(123456789);
  });

  it('recusa mais de 2 casas e formatos estranhos', () => {
    expect(() => paraCentavos(10.005)).toThrow(/2 casas/);
    expect(() => paraCentavos('1,50')).toThrow(/inválido/);
    expect(() => paraCentavos('abc')).toThrow(/inválido/);
  });

  it('volta para texto e para reais', () => {
    expect(deCentavos(-4790)).toBe('-47.90');
    expect(deCentavos(5)).toBe('0.05');
    expect(emReais(-114600)).toBe('-R$ 1.146,00');
    expect(emReais(123456789)).toBe('R$ 1.234.567,89');
  });
});
