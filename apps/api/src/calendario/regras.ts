import {
  type Data,
  anoMes,
  criarData,
  diaDaSemana,
  diferencaEmDias,
  ehData,
  somarDias,
  somarMeses,
  ultimoDiaDoMes,
} from './datas.js';
import { ehFeriadoBancario } from './feriados.js';

/** RN-02: segunda a sexta, menos os dias sem expediente bancário nacional. */
export function ehDiaUtil(data: Data): boolean {
  const semana = diaDaSemana(data);
  return semana !== 0 && semana !== 6 && !ehFeriadoBancario(data);
}

export function proximoDiaUtil(data: Data): Data {
  let d = data;
  while (!ehDiaUtil(d)) d = somarDias(d, 1);
  return d;
}

export function diaUtilAnterior(data: Data): Data {
  let d = data;
  while (!ehDiaUtil(d)) d = somarDias(d, -1);
  return d;
}

export function ultimoDiaUtilDoMes(ano: number, mes: number): Data {
  return diaUtilAnterior(criarData(ano, mes, ultimoDiaDoMes(ano, mes)));
}

/** RN-03: o vale é creditado no dia 25 ou no último dia útil antes dele. */
export function creditoDoVale(ano: number, mes: number): Data {
  return diaUtilAnterior(criarData(ano, mes, 25));
}

// ---------------------------------------------------------------------------
// Ciclo financeiro (RN-01, RN-04)

/** Identificador do ciclo: `AAAA-MM`, o mês que o ciclo representa. */
export type IdCiclo = string;

const FORMATO_CICLO = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function ehIdCiclo(valor: unknown): valor is IdCiclo {
  return typeof valor === 'string' && FORMATO_CICLO.test(valor);
}

export function idCiclo(ano: number, mes: number): IdCiclo {
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

function partesCiclo(id: IdCiclo): [number, number] {
  const m = FORMATO_CICLO.exec(id);
  if (!m) throw new Error(`Ciclo inválido: ${id}`);
  return [Number(m[1]), Number(m[2])];
}

export function somarCiclos(id: IdCiclo, n: number): IdCiclo {
  const [ano, mes] = partesCiclo(id);
  return idCiclo(...somarMeses(ano, mes, n));
}

/** Datas reais do salário informadas pelo usuário (RN-04), por ciclo. */
export type DatasReais = ReadonlyMap<IdCiclo, Data>;

const SEM_DATAS_REAIS: DatasReais = new Map();

/** RN-01: o salário do ciclo M é esperado no último dia útil de M−1. */
export function salarioEsperado(id: IdCiclo): Data {
  const [ano, mes] = partesCiclo(id);
  return ultimoDiaUtilDoMes(...somarMeses(ano, mes, -1));
}

export function inicioDoCiclo(id: IdCiclo, reais: DatasReais = SEM_DATAS_REAIS): Data {
  return reais.get(id) ?? salarioEsperado(id);
}

/** O ciclo termina na véspera do início do seguinte. */
export function fimDoCiclo(id: IdCiclo, reais: DatasReais = SEM_DATAS_REAIS): Data {
  return somarDias(inicioDoCiclo(somarCiclos(id, 1), reais), -1);
}

/** Ciclo que contém a data (RN-01), já considerando as datas reais do salário (RN-04). */
export function cicloDaData(data: Data, reais: DatasReais = SEM_DATAS_REAIS): IdCiclo {
  const [ano, mes] = anoMes(data);
  // O ciclo M começa perto do fim de M−1, então a data está no ciclo do seu mês ou do seguinte.
  // Com datas reais, um ciclo vizinho pode ter avançado ou recuado alguns dias.
  for (const deslocamento of [1, 0, -1, 2, -2]) {
    const id = idCiclo(...somarMeses(ano, mes, deslocamento));
    if (inicioDoCiclo(id, reais) <= data && data <= fimDoCiclo(id, reais)) return id;
  }
  throw new Error(`Nenhum ciclo contém ${data}; confira as datas reais do salário`);
}

/** Limite de distância entre a data real e a esperada (RN-04). */
export const TOLERANCIA_DATA_REAL_DIAS = 15;

/**
 * Confere se a data real do salário pode ser usada no ciclo (RN-04): perto da data esperada
 * e sem inverter a ordem dos ciclos vizinhos. Devolve a mensagem de erro, ou null se puder.
 */
export function validarDataReal(id: IdCiclo, data: Data, reais: DatasReais = SEM_DATAS_REAIS): string | null {
  if (!ehData(data)) return 'Data inválida';
  const esperado = salarioEsperado(id);
  if (Math.abs(diferencaEmDias(data, esperado)) > TOLERANCIA_DATA_REAL_DIAS) {
    return `A data real precisa estar a até ${TOLERANCIA_DATA_REAL_DIAS} dias da esperada (${esperado})`;
  }
  const outros = new Map(reais);
  outros.delete(id);
  const inicioAnterior = inicioDoCiclo(somarCiclos(id, -1), outros);
  const inicioSeguinte = inicioDoCiclo(somarCiclos(id, 1), outros);
  if (data <= inicioAnterior) return `A data precisa ser depois do início do ciclo anterior (${inicioAnterior})`;
  if (data >= inicioSeguinte) return `A data precisa ser antes do início do ciclo seguinte (${inicioSeguinte})`;
  return null;
}

export interface Ciclo {
  id: IdCiclo;
  inicio: Data;
  fim: Data;
  salarioEsperado: Data;
  salarioReal: Data | null;
  creditoDoVale: Data | null;
}

export function descreverCiclo(id: IdCiclo, reais: DatasReais = SEM_DATAS_REAIS): Ciclo {
  const inicio = inicioDoCiclo(id, reais);
  const fim = fimDoCiclo(id, reais);
  // O vale do mês M−1 (dia 25) e o do mês M podem cair dentro do ciclo; mostra o que cair.
  const [ano, mes] = partesCiclo(id);
  const vale = [somarMeses(ano, mes, -1), [ano, mes] as [number, number]]
    .map(([a, m]) => creditoDoVale(a, m))
    .find((d) => inicio <= d && d <= fim);
  return {
    id,
    inicio,
    fim,
    salarioEsperado: salarioEsperado(id),
    salarioReal: reais.get(id) ?? null,
    creditoDoVale: vale ?? null,
  };
}
