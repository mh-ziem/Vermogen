/** Formatos devolvidos pela API (apps/api). */
export type TipoDeConta = 'corrente' | 'cartao' | 'investimento' | 'uso_restrito'
export type Finalidade = 'gasto' | 'recebimento' | 'reserva' | 'investimento'

export interface Instituicao {
  id: string
  nome: string
  cor: string
  ativa: boolean
}

export interface FaturaDaCompra {
  fechamento: string
  vencimento: string
  ciclo: string
}

export interface Conta {
  id: string
  nome: string
  tipo: TipoDeConta
  ativa: boolean
  instituicao: Instituicao
  finalidade: { atual: Finalidade; desde: string } | null
  cartao: { diaFechamento: number; diaVencimento: number; proximaFatura: FaturaDaCompra } | null
}

export interface VigenciaDeFinalidade {
  id: string
  finalidade: Finalidade
  vigenteDe: string
  vigenteAte: string | null
}

export interface Ciclo {
  id: string
  inicio: string
  fim: string
  salarioEsperado: string
  salarioReal: string | null
  creditoDoVale: string | null
}
