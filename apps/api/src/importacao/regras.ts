import { createHash } from 'node:crypto';
import { emReais } from '../comum/dinheiro.js';
import { normalizarTexto } from '../comum/texto.js';

export interface ItemDoLote {
  data: string;
  descricao: string;
  centavos: number;
  parcela?: { numero: number; total: number } | undefined;
}

export interface Conferencia {
  /** Como o lote foi conferido (QA-04). */
  modo: 'total' | 'saldo' | 'nenhuma';
  /** Soma dos itens menos o esperado; 0 quando confere. */
  diferenca: number;
}

/**
 * QA-04: confere a soma dos itens com o total declarado; sem total, com saldo inicial + movimentos
 * = saldo final; sem nenhum dos dois, o lote fica "não conferido".
 */
export function conferir(
  itens: readonly ItemDoLote[],
  declarado: { total?: number | undefined; saldoInicial?: number | undefined; saldoFinal?: number | undefined },
): Conferencia {
  const soma = itens.reduce((s, i) => s + i.centavos, 0);
  if (declarado.total !== undefined) return { modo: 'total', diferenca: soma - declarado.total };
  if (declarado.saldoInicial !== undefined && declarado.saldoFinal !== undefined) {
    return { modo: 'saldo', diferenca: declarado.saldoInicial + soma - declarado.saldoFinal };
  }
  return { modo: 'nenhuma', diferenca: 0 };
}

export function mensagemDeDiferenca(c: Conferencia, soma: number): string {
  const esperado = soma - c.diferenca;
  const base = c.modo === 'total' ? 'o total declarado' : 'o saldo final menos o inicial';
  return (
    `Lote rejeitado: a soma dos itens (${emReais(soma)}) não bate com ${base} (${emReais(esperado)}). ` +
    `Diferença: ${emReais(c.diferenca)}. Nada foi gravado; confira a leitura do documento e reenvie.`
  );
}

/** Chave para achar possíveis duplicatas (D2): mesma conta, data, valor, descrição e parcela. */
export function chaveDeDuplicata(contaId: string | null, item: ItemDoLote): string {
  const parcela = item.parcela ? `${item.parcela.numero}/${item.parcela.total}` : '';
  return [contaId ?? '-', item.data, item.centavos, normalizarTexto(item.descricao), parcela].join('|');
}

/**
 * Hash do conteúdo do lote (DT-10), calculado pelo app: independe da ordem dos itens e de
 * diferenças de caixa, acento e espaço na descrição.
 */
export function hashDoLote(contaId: string, itens: readonly ItemDoLote[]): string {
  const chaves = itens.map((i) => chaveDeDuplicata(contaId, i)).sort();
  return createHash('sha256').update(JSON.stringify([contaId, chaves])).digest('hex');
}
