import type { CicloProjetado, FixaProjetada, ItemDaProjecao, StatusDaFatura } from '@/api/tipos'
import { reais } from '@/formato'
import { centavos, textoAbsoluto } from './formato'

/**
 * Valor de saída na convenção do app (negativo sai) mostrado como saída: "-1146.00" → "R$ 1.146,00".
 * Um valor positivo dentro de uma saída (estorno, crédito na fatura) aparece com "+".
 */
export function comoSaida(valor: string): { texto: string; entra: boolean } {
  const c = centavos(valor)
  return c > 0 ? { texto: `+${reais(textoAbsoluto(c))}`, entra: true } : { texto: reais(textoAbsoluto(c)), entra: false }
}

/**
 * Parte de totais.faturas que não está em nenhuma fatura listada, em centavos (0 se as faturas já a
 * incluem). O contrato diz que flexiveisNosCartoes "já está somado em totais.faturas", sem dizer se
 * também está no valor de alguma fatura; assim a tela fecha a conta nos dois casos.
 */
export function restoDasFaturas(ciclo: CicloProjetado): number {
  const listadas = ciclo.faturas.reduce((s, f) => s + centavos(f.valor), 0)
  return centavos(ciclo.totais.faturas) - listadas
}

export const STATUS_DA_FATURA: Record<StatusDaFatura, string> = {
  fechada: 'fechada',
  a_importar: 'a importar',
  projetada: 'projetada',
}

export const ORIGEM_DO_ITEM: Record<ItemDaProjecao['origem'], string> = {
  realizado: 'realizado',
  parcela: 'parcela',
  recorrente: 'recorrente',
  estimativa: 'estimativa',
}

export const BASE_DA_FIXA: Record<FixaProjetada['base'], string> = {
  fixo: 'valor fixo',
  maior_3: 'maior dos 3',
  realizado: 'realizado',
  parcela: 'parcela',
}
