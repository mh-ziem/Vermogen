import type { FixaProjetada, ItemDaProjecao, StatusDaFatura, Veredito } from '@/api/tipos'

/** Rótulo e classe do chip de cada veredito (RN-16). */
export const VEREDITOS: Record<Veredito, { rotulo: string; classe: 'ok' | 'warn' | 'bad' }> = {
  positivo: { rotulo: 'Positivo', classe: 'ok' },
  moderado: { rotulo: 'Moderado', classe: 'warn' },
  negativo: { rotulo: 'Negativo', classe: 'bad' },
}

export const STATUS_DA_FATURA: Record<StatusDaFatura, string> = {
  fechada: 'fechada',
  a_importar: 'a importar',
  projetada: 'projetada',
}

export const BASES_DA_FIXA: Record<FixaProjetada['base'], string> = {
  fixo: 'valor fixo',
  maior_3: 'maior dos 3',
  realizado: 'realizado',
  parcela: 'parcela',
}

export const ORIGENS_DO_ITEM: Record<ItemDaProjecao['origem'], string> = {
  realizado: 'realizado',
  parcela: 'parcela',
  recorrente: 'recorrente',
  estimativa: 'estimativa',
}

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

/** `2026-08` → `Ago/26`. */
export function cicloCurto(id: string): string {
  const [a, m] = id.split('-')
  return `${MESES_CURTOS[Number(m) - 1] ?? m}/${a?.slice(2)}`
}

/** Texto da API negativo? ("-460.00"). */
export function negativo(valor: string): boolean {
  return valor.trim().startsWith('-')
}

/** "-460.00" → "460.00". */
export function semSinal(valor: string): string {
  return valor.trim().replace(/^[-+]/, '')
}

/**
 * Valor positivo digitado ("460", "460,00", "1.146,5", "1.500", "R$ 460.00") → texto da API com 2 casas ("460.00").
 * Aceita zero; devolve null se for negativo ou inválido.
 */
export function dinheiroDigitado(texto: string): string | null {
  const t = texto.trim().replace(/\s|R\$/g, '').replace(/^\+/, '')
  if (!t || t.startsWith('-')) return null
  // "1.146,50" e "1.500" (milhar com ponto) ou "1146.50" (ponto decimal).
  const decimal =
    /,\d{1,2}$/.test(t) || /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(decimal)) return null
  const [inteiro = '0', dec = ''] = decimal.split('.')
  return `${inteiro.replace(/^0+(?=\d)/, '')}.${dec.padEnd(2, '0')}`
}

/** Percentual digitado ("10", "12,5") → número de 0 a 100, ou null. */
export function percentualDigitado(texto: string): number | null {
  const t = texto.trim().replace('%', '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  const n = Number(t)
  return n > 100 ? null : n
}

/** Número em formato brasileiro, até 1 casa: 12.5 → "12,5". */
export function numeroCurto(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

/** Parte (em módulo) sobre o total, em %: ("-460.00", "4600.00") → "10%". */
export function percentual(parte: string, total: string): string {
  const t = Number(total)
  if (!t) return '—'
  return `${numeroCurto((Math.abs(Number(parte)) / Math.abs(t)) * 100)}%`
}

/** Instante ISO → "15/11 às 10:42", no fuso de São Paulo. */
export function dataHora(iso: string): string {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const p = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((x) => x.type === tipo)?.value ?? ''
  return `${p('day')}/${p('month')} às ${p('hour')}:${p('minute')}`
}
