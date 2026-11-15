import { type Data, criarData, somarDias } from './datas.js';

/** Domingo de Páscoa pelo algoritmo de Meeus/Jones/Butcher (calendário gregoriano). */
export function pascoa(ano: number): Data {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const diaDoMes = ((h + l - 7 * m + 114) % 31) + 1;
  return criarData(ano, mes, diaDoMes);
}

export interface Feriado {
  data: Data;
  nome: string;
}

/**
 * Dias sem expediente bancário em todo o país (RN-02): feriados nacionais, carnaval,
 * Sexta-feira Santa e Corpus Christi (calendário bancário nacional) e o 31/12, que não
 * tem expediente bancário. Feriados estaduais e municipais ficam de fora.
 */
export function feriadosBancarios(ano: number): Feriado[] {
  const p = pascoa(ano);
  const lista: Feriado[] = [
    { data: criarData(ano, 1, 1), nome: 'Confraternização Universal' },
    { data: somarDias(p, -48), nome: 'Carnaval (segunda-feira)' },
    { data: somarDias(p, -47), nome: 'Carnaval (terça-feira)' },
    { data: somarDias(p, -2), nome: 'Sexta-feira Santa' },
    { data: criarData(ano, 4, 21), nome: 'Tiradentes' },
    { data: criarData(ano, 5, 1), nome: 'Dia do Trabalho' },
    { data: somarDias(p, 60), nome: 'Corpus Christi' },
    { data: criarData(ano, 9, 7), nome: 'Independência do Brasil' },
    { data: criarData(ano, 10, 12), nome: 'Nossa Senhora Aparecida' },
    { data: criarData(ano, 11, 2), nome: 'Finados' },
    { data: criarData(ano, 11, 15), nome: 'Proclamação da República' },
    { data: criarData(ano, 12, 25), nome: 'Natal' },
    { data: criarData(ano, 12, 31), nome: 'Sem expediente bancário' },
  ];
  // Dia Nacional de Zumbi e da Consciência Negra: feriado nacional desde 2024 (Lei 14.759/2023).
  if (ano >= 2024) lista.push({ data: criarData(ano, 11, 20), nome: 'Consciência Negra' });
  return lista.sort((x, y) => (x.data < y.data ? -1 : 1));
}

const cache = new Map<number, Set<Data>>();

export function ehFeriadoBancario(data: Data): boolean {
  const ano = Number(data.slice(0, 4));
  let datas = cache.get(ano);
  if (!datas) {
    datas = new Set(feriadosBancarios(ano).map((f) => f.data));
    cache.set(ano, datas);
  }
  return datas.has(data);
}
