import type { Finalidade, Natureza, TipoDeConta, TipoDeTransacao } from '@/api/tipos'

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

export const TIPOS_DE_TRANSACAO: Record<TipoDeTransacao, string> = {
  receita: 'Receita',
  despesa: 'Despesa',
  transferencia: 'Transferência',
  pagamento_fatura: 'Pagamento de fatura',
  receita_fora_das_contas: 'Receita fora das contas',
}

export const NATUREZAS: Record<Natureza, string> = {
  intermitente: 'Intermitente',
  parcelada: 'Parcelada',
  pontual: 'Pontual',
  flexivel: 'Flexível',
}

/** Valor da API (texto decimal, ex.: "-1146.00") → "-R$ 1.146,00". */
export function reais(valor: string | null | undefined): string {
  if (valor === null || valor === undefined) return '—'
  const negativo = valor.startsWith('-')
  const [inteiro = '0', dec = '00'] = valor.replace('-', '').split('.')
  const milhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${negativo ? '-' : ''}R$ ${milhar},${dec.padEnd(2, '0')}`
}

/** Ciclo vizinho: `2026-11`, +1 → `2026-12`. */
export function somarCiclos(id: string, n: number): string {
  const [a, m] = id.split('-').map(Number) as [number, number]
  const total = a * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}
