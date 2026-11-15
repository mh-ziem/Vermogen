import { type RegraDeCategorizacao, escolherRegra, regraSeAplica, tipoPeloSinal } from './regras.js';

function regra(parcial: Partial<RegraDeCategorizacao>): RegraDeCategorizacao {
  return { id: 'r', padrao: 'x', contaId: null, valorMinimo: null, valorMaximo: null, categoriaId: 'cat', tipo: null, prioridade: 0, ...parcial };
}

describe('HU-12 — regras de categorização', () => {
  const alvo = { descricao: 'PAG*Posto Shell Ipiranga', contaId: 'nubank', centavos: -20000 };

  it('CA1: casa por texto (sem acento e sem caixa), conta e faixa de valor', () => {
    expect(regraSeAplica(regra({ padrao: 'posto shell' }), alvo)).toBe(true);
    expect(regraSeAplica(regra({ padrao: 'pôsto' }), alvo)).toBe(true);
    expect(regraSeAplica(regra({ padrao: 'shell', contaId: 'inter' }), alvo)).toBe(false);
    expect(regraSeAplica(regra({ padrao: 'shell', valorMinimo: 10000, valorMaximo: 30000 }), alvo)).toBe(true);
    expect(regraSeAplica(regra({ padrao: 'shell', valorMaximo: 10000 }), alvo)).toBe(false);
  });

  it('escolhe a de maior prioridade e, no empate, a mais específica', () => {
    const geral = regra({ id: 'geral', padrao: 'posto' });
    const daConta = regra({ id: 'conta', padrao: 'posto', contaId: 'nubank' });
    const prioritaria = regra({ id: 'prio', padrao: 'shell', prioridade: 10 });
    expect(escolherRegra([geral, daConta], alvo)?.id).toBe('conta');
    expect(escolherRegra([geral, daConta, prioritaria], alvo)?.id).toBe('prio');
    expect(escolherRegra([regra({ padrao: 'mercado' })], alvo)).toBeNull();
  });

  it('sem regra de tipo, o sinal decide', () => {
    expect(tipoPeloSinal(100)).toBe('receita');
    expect(tipoPeloSinal(-100)).toBe('despesa');
  });
});
