import { chaveDeDuplicata, conferir, hashDoLote, mensagemDeDiferenca } from './regras.js';

const itens = [
  { data: '2026-10-28', descricao: 'Supermercado Pão de Açúcar', centavos: -4790 },
  { data: '2026-10-29', descricao: 'Posto Shell', centavos: -20000 },
  { data: '2026-10-30', descricao: 'Estorno', centavos: 1500 },
];

describe('HU-08 — conferência do lote (QA-04)', () => {
  it('CA1: confere com o total declarado ao centavo', () => {
    expect(conferir(itens, { total: -23290 })).toEqual({ modo: 'total', diferenca: 0 });
    expect(conferir(itens, { total: -23291 })).toEqual({ modo: 'total', diferenca: 1 });
  });

  it('CA3: sem total, saldo inicial + movimentos = saldo final', () => {
    expect(conferir(itens, { saldoInicial: 100000, saldoFinal: 76710 })).toEqual({ modo: 'saldo', diferenca: 0 });
    expect(conferir(itens, { saldoInicial: 100000, saldoFinal: 76700 }).diferenca).toBe(10);
  });

  it('CA4: sem total nem saldo, não conferido', () => {
    expect(conferir(itens, {})).toEqual({ modo: 'nenhuma', diferenca: 0 });
  });

  it('o total tem precedência sobre o saldo', () => {
    expect(conferir(itens, { total: -23290, saldoInicial: 0, saldoFinal: 999 }).modo).toBe('total');
  });

  it('a mensagem de rejeição diz a diferença', () => {
    const c = conferir(itens, { total: -23300 });
    expect(mensagemDeDiferenca(c, -23290)).toMatch(/Diferença: R\$ 0,10/);
  });
});

describe('hash e duplicatas (QA-05, D2)', () => {
  it('o hash não depende da ordem dos itens nem de acento ou caixa', () => {
    const outro = [itens[2]!, { ...itens[0]!, descricao: 'SUPERMERCADO PAO DE  ACUCAR' }, itens[1]!];
    expect(hashDoLote('c1', outro)).toBe(hashDoLote('c1', itens));
  });

  it('muda com a conta ou com qualquer valor', () => {
    expect(hashDoLote('c2', itens)).not.toBe(hashDoLote('c1', itens));
    expect(hashDoLote('c1', [{ ...itens[0]!, centavos: -4791 }, itens[1]!, itens[2]!])).not.toBe(hashDoLote('c1', itens));
  });

  it('a parcela faz parte da chave: parcela 2/4 e 3/4 não são duplicatas', () => {
    const base = { data: '2026-08-10', descricao: 'Loja X', centavos: -29000 };
    expect(chaveDeDuplicata('c', { ...base, parcela: { numero: 2, total: 4 } })).not.toBe(
      chaveDeDuplicata('c', { ...base, parcela: { numero: 3, total: 4 } }),
    );
  });
});
