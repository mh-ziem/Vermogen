import type { Finalidade, TipoDeConta } from '@/api/tipos'

/** Primeira vigência de conta cadastrada sem data (apps/api, DESDE_SEMPRE). */
export const DESDE_SEMPRE = '2000-01-01'

export const TIPOS: Record<TipoDeConta, string> = {
  corrente: 'Conta corrente',
  cartao: 'Cartão',
  investimento: 'Investimento',
  uso_restrito: 'Uso restrito',
}

export const FINALIDADES: Record<Finalidade, string> = {
  gasto: 'Gasto',
  recebimento: 'Recebimento',
  reserva: 'Reserva',
  investimento: 'Investimento',
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

/** `2026-11-30` → `30/11/2026`; com `curta`, `30/11`. */
export function data(iso: string | null | undefined, curta = false): string {
  if (!iso) return '—'
  const [a, m, d] = iso.split('-')
  return curta ? `${d}/${m}` : `${d}/${m}/${a}`
}

/** `2026-11` → `Novembro/26`. */
export function ciclo(id: string): string {
  const [a, m] = id.split('-')
  return `${MESES[Number(m) - 1] ?? m}/${a?.slice(2)}`
}

/** `desde 16/03/2027`, ou `desde o início` para a vigência sem data. */
export function desde(iso: string): string {
  return iso === DESDE_SEMPRE ? 'desde o início' : `desde ${data(iso)}`
}

/** Hoje no fuso de São Paulo, `AAAA-MM-DD`. */
export function hoje(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}
