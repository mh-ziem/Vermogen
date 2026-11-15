import { ehFeriadoBancario, feriadosBancarios, pascoa } from './feriados.js';

describe('feriados bancários nacionais (RN-02)', () => {
  it('calcula a Páscoa', () => {
    expect(pascoa(2025)).toBe('2025-04-20');
    expect(pascoa(2026)).toBe('2026-04-05');
    expect(pascoa(2027)).toBe('2027-03-28');
  });

  it('inclui os feriados móveis de 2026', () => {
    const datas = feriadosBancarios(2026).map((f) => f.data);
    expect(datas).toEqual(
      expect.arrayContaining(['2026-02-16', '2026-02-17', '2026-04-03', '2026-06-04']),
    );
  });

  it('25/12, 31/12, 02/11 e 20/11 não têm expediente', () => {
    for (const d of ['2026-12-25', '2026-12-31', '2026-11-02', '2026-11-20']) {
      expect(ehFeriadoBancario(d)).toBe(true);
    }
  });

  it('24/12 e quarta de cinzas são dias com expediente', () => {
    expect(ehFeriadoBancario('2026-12-24')).toBe(false);
    expect(ehFeriadoBancario('2026-02-18')).toBe(false);
  });

  it('Consciência Negra só é nacional a partir de 2024', () => {
    expect(ehFeriadoBancario('2023-11-20')).toBe(false);
    expect(ehFeriadoBancario('2024-11-20')).toBe(true);
  });
});
