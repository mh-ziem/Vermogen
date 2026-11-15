import {
  cicloDaData,
  creditoDoVale,
  descreverCiclo,
  ehDiaUtil,
  fimDoCiclo,
  inicioDoCiclo,
  proximoDiaUtil,
  salarioEsperado,
  validarDataReal,
} from './regras.js';

describe('dias úteis (RN-02)', () => {
  it('fim de semana e feriado não são úteis', () => {
    expect(ehDiaUtil('2026-10-31')).toBe(false); // sábado
    expect(ehDiaUtil('2026-11-02')).toBe(false); // Finados
    expect(ehDiaUtil('2026-12-31')).toBe(false); // sem expediente bancário
    expect(ehDiaUtil('2026-10-30')).toBe(true);
  });

  it('próximo dia útil pula fim de semana e feriado', () => {
    expect(proximoDiaUtil('2026-11-07')).toBe('2026-11-09');
    expect(proximoDiaUtil('2026-10-31')).toBe('2026-11-03'); // sáb → dom → Finados → terça
  });
});

describe('HU-06 — ciclo financeiro (RN-01)', () => {
  it('CA1: ciclo Novembro/26 vai de 30/10 a 29/11 (31/10 é sábado)', () => {
    expect(inicioDoCiclo('2026-11')).toBe('2026-10-30');
    expect(fimDoCiclo('2026-11')).toBe('2026-11-29');
  });

  it('CA2: ciclo Janeiro/27 começa em 30/12/26 (31/12 sem expediente)', () => {
    expect(inicioDoCiclo('2027-01')).toBe('2026-12-30');
    expect(fimDoCiclo('2026-12')).toBe('2026-12-29');
  });

  it('CA3: ciclo Fevereiro/27 começa em 29/01/27', () => {
    expect(inicioDoCiclo('2027-02')).toBe('2027-01-29');
  });

  it('cada data cai em exatamente um ciclo, nas bordas', () => {
    expect(cicloDaData('2026-10-29')).toBe('2026-10');
    expect(cicloDaData('2026-10-30')).toBe('2026-11');
    expect(cicloDaData('2026-10-31')).toBe('2026-11');
    expect(cicloDaData('2026-11-29')).toBe('2026-11');
    expect(cicloDaData('2026-11-30')).toBe('2026-12');
    expect(cicloDaData('2026-12-25')).toBe('2026-12');
    expect(cicloDaData('2026-12-30')).toBe('2027-01');
    expect(cicloDaData('2026-12-31')).toBe('2027-01');
    expect(cicloDaData('2027-01-01')).toBe('2027-01');
  });

  it('não há buraco nem sobreposição entre ciclos ao longo de dois anos', () => {
    let id = '2026-01';
    for (let i = 0; i < 24; i++) {
      const seguinte = descreverCiclo(id).fim;
      const [ano, mes] = id.split('-').map(Number) as [number, number];
      const proximo = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, '0')}`;
      expect(inicioDoCiclo(proximo) > seguinte).toBe(true);
      expect(cicloDaData(seguinte)).toBe(id);
      id = proximo;
    }
  });
});

describe('HU-06 CA4 — data real do salário (RN-04)', () => {
  const reais = new Map([['2026-12', '2026-12-01']]);

  it('substitui a data calculada e redistribui as datas entre os ciclos', () => {
    expect(inicioDoCiclo('2026-12', reais)).toBe('2026-12-01');
    expect(fimDoCiclo('2026-11', reais)).toBe('2026-11-30');
    expect(cicloDaData('2026-11-30', reais)).toBe('2026-11');
    expect(cicloDaData('2026-11-30')).toBe('2026-12');
    expect(descreverCiclo('2026-12', reais).salarioReal).toBe('2026-12-01');
  });

  it('aceita uma data perto da esperada', () => {
    expect(validarDataReal('2026-12', '2026-12-01')).toBeNull();
    expect(validarDataReal('2026-12', '2026-11-27')).toBeNull();
  });

  it('recusa datas longe da esperada ou que invertem a ordem dos ciclos', () => {
    expect(validarDataReal('2026-12', '2026-12-20')).toMatch(/15 dias/);
    expect(validarDataReal('2026-12', '2026-12-30')).toMatch(/15 dias|seguinte/);
    const vizinho = new Map([['2026-11', '2026-11-15']]); // ciclo anterior começando na mesma data
    expect(validarDataReal('2026-12', '2026-11-15', vizinho)).toMatch(/anterior/);
    expect(validarDataReal('2026-12', 'ontem')).toBe('Data inválida');
  });

  it('salário esperado é o último dia útil do mês anterior', () => {
    expect(salarioEsperado('2026-11')).toBe('2026-10-30');
    expect(salarioEsperado('2026-12')).toBe('2026-11-30');
  });
});

describe('crédito do vale (RN-03)', () => {
  it('dia 25, ou o último dia útil antes', () => {
    expect(creditoDoVale(2026, 11)).toBe('2026-11-25'); // quarta
    expect(creditoDoVale(2026, 12)).toBe('2026-12-24'); // 25/12 é Natal
    expect(creditoDoVale(2026, 10)).toBe('2026-10-23'); // 25/10 é domingo
  });

  it('o ciclo mostra o vale que cai dentro dele (tabela do PRD §9.2)', () => {
    expect(descreverCiclo('2026-11').creditoDoVale).toBe('2026-11-25');
    expect(descreverCiclo('2026-12').creditoDoVale).toBe('2026-12-24');
  });
});
