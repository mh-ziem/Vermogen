/**
 * Datas de calendário, sem hora e sem fuso, no formato `AAAA-MM-DD` (SAD DT-08).
 * A aritmética usa o número de dias desde 1970-01-01, então não há erro de horário de verão.
 */
export type Data = string;

const FORMATO = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_POR_DIA = 86_400_000;

export function ehData(valor: unknown): valor is Data {
  if (typeof valor !== 'string') return false;
  const m = FORMATO.exec(valor);
  if (!m) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= ultimoDiaDoMes(ano, mes);
}

function partes(data: Data): [number, number, number] {
  const m = FORMATO.exec(data);
  if (!m || !ehData(data)) throw new Error(`Data inválida: ${data}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function criarData(ano: number, mes: number, dia: number): Data {
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export function paraDias(data: Data): number {
  const [ano, mes, dia] = partes(data);
  return Date.UTC(ano, mes - 1, dia) / MS_POR_DIA;
}

export function deDias(dias: number): Data {
  const d = new Date(dias * MS_POR_DIA);
  return criarData(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function somarDias(data: Data, dias: number): Data {
  return deDias(paraDias(data) + dias);
}

export function diferencaEmDias(a: Data, b: Data): number {
  return paraDias(a) - paraDias(b);
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(data: Data): number {
  return (((paraDias(data) + 4) % 7) + 7) % 7; // 1970-01-01 foi quinta-feira
}

export function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

export function anoMes(data: Data): [number, number] {
  const [ano, mes] = partes(data);
  return [ano, mes];
}

export function dia(data: Data): number {
  return partes(data)[2];
}

/** Soma meses a um par (ano, mês). */
export function somarMeses(ano: number, mes: number, meses: number): [number, number] {
  const total = ano * 12 + (mes - 1) + meses;
  return [Math.floor(total / 12), (total % 12) + 1];
}

/** Data de hoje no fuso de São Paulo (SAD DT-08). */
export function hoje(agora: Date = new Date()): Data {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
}
