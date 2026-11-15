import { type Data, anoMes, criarData, dia, somarMeses, ultimoDiaDoMes } from '../calendario/datas.js';
import { type DatasReais, type IdCiclo, cicloDaData, proximoDiaUtil } from '../calendario/regras.js';

/** Dias de fechamento e de vencimento configurados no cartão (RN-08). */
export interface DiasDoCartao {
  diaFechamento: number;
  diaVencimento: number;
}

export interface FaturaDaCompra {
  /** Data em que a fatura fecha. */
  fechamento: Data;
  /** Vencimento já ajustado para dia útil (RN-09). */
  vencimento: Data;
  /** Ciclo que contém o vencimento: é nele que a compra é paga (RN-08). */
  ciclo: IdCiclo;
}

/** RN-09: fechamento num dia que o mês não tem passa para o último dia do mês. */
function diaNoMes(ano: number, mes: number, diaDesejado: number): Data {
  return criarData(ano, mes, Math.min(diaDesejado, ultimoDiaDoMes(ano, mes)));
}

function validarDias({ diaFechamento, diaVencimento }: DiasDoCartao): void {
  for (const [nome, valor] of [
    ['fechamento', diaFechamento],
    ['vencimento', diaVencimento],
  ] as const) {
    if (!Number.isInteger(valor) || valor < 1 || valor > 31) {
      throw new Error(`Dia de ${nome} precisa ser de 1 a 31`);
    }
  }
}

/**
 * Fechamento da fatura em que a compra entra: o primeiro fechamento **depois** da data da compra.
 * Uma compra no próprio dia do fechamento entra na fatura seguinte (SAD DM-12).
 */
export function fechamentoDaCompra(dataCompra: Data, cartao: DiasDoCartao): Data {
  validarDias(cartao);
  const [ano, mes] = anoMes(dataCompra);
  for (let i = 0; ; i++) {
    const fechamento = diaNoMes(...somarMeses(ano, mes, i), cartao.diaFechamento);
    if (fechamento > dataCompra) return fechamento;
  }
}

/**
 * Vencimento da fatura: o primeiro dia de vencimento depois do fechamento
 * (no mesmo mês se o dia ainda não passou, senão no mês seguinte), levado ao próximo dia útil (RN-09).
 */
export function vencimentoDaFatura(fechamento: Data, cartao: DiasDoCartao): Data {
  validarDias(cartao);
  const [ano, mes] = anoMes(fechamento);
  const noMesmoMes = diaNoMes(ano, mes, cartao.diaVencimento);
  const nominal = dia(noMesmoMes) > dia(fechamento) ? noMesmoMes : diaNoMes(...somarMeses(ano, mes, 1), cartao.diaVencimento);
  return proximoDiaUtil(nominal);
}

/** RN-08: em que fatura a compra entra e em que ciclo ela é paga. */
export function faturaDaCompra(dataCompra: Data, cartao: DiasDoCartao, reais?: DatasReais): FaturaDaCompra {
  const fechamento = fechamentoDaCompra(dataCompra, cartao);
  const vencimento = vencimentoDaFatura(fechamento, cartao);
  return { fechamento, vencimento, ciclo: cicloDaData(vencimento, reais) };
}
