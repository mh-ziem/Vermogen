import { normalizarTexto } from '../comum/texto.js';

export type TipoDeTransacao = 'receita' | 'despesa' | 'transferencia' | 'pagamento_fatura' | 'receita_fora_das_contas';

export interface RegraDeCategorizacao {
  id: string;
  padrao: string;
  contaId: string | null;
  valorMinimo: number | null;
  valorMaximo: number | null;
  categoriaId: string | null;
  tipo: TipoDeTransacao | null;
  prioridade: number;
}

export interface Alvo {
  descricao: string;
  contaId: string | null;
  centavos: number;
}

/** A regra vale se o texto contém o padrão e, quando definidos, a conta e a faixa de valor batem (HU-12 CA1). */
export function regraSeAplica(regra: RegraDeCategorizacao, alvo: Alvo): boolean {
  if (regra.contaId && regra.contaId !== alvo.contaId) return false;
  const valor = Math.abs(alvo.centavos);
  if (regra.valorMinimo !== null && valor < regra.valorMinimo) return false;
  if (regra.valorMaximo !== null && valor > regra.valorMaximo) return false;
  return normalizarTexto(alvo.descricao).includes(normalizarTexto(regra.padrao));
}

/**
 * Escolhe a regra para a transação: maior prioridade; no empate, a mais específica
 * (com conta, com faixa de valor, padrão mais longo).
 */
export function escolherRegra<R extends RegraDeCategorizacao>(regras: readonly R[], alvo: Alvo): R | null {
  const especificidade = (r: RegraDeCategorizacao) =>
    (r.contaId ? 1000 : 0) + (r.valorMinimo !== null || r.valorMaximo !== null ? 500 : 0) + r.padrao.length;
  const candidatas = regras.filter((r) => regraSeAplica(r, alvo));
  candidatas.sort((a, b) => b.prioridade - a.prioridade || especificidade(b) - especificidade(a));
  return candidatas[0] ?? null;
}

/** Sem regra que defina o tipo: entrada é receita, saída é despesa. */
export function tipoPeloSinal(centavos: number): TipoDeTransacao {
  return centavos > 0 ? 'receita' : 'despesa';
}
