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

export type TipoDeTransacao = 'receita' | 'despesa' | 'transferencia' | 'pagamento_fatura' | 'receita_fora_das_contas'
export type Natureza = 'intermitente' | 'parcelada' | 'pontual' | 'flexivel'

export interface Categoria {
  id: string
  nome: string
  paiId: string | null
  natureza: Natureza | null
  ativa: boolean
}

export interface Regra {
  id: string
  padrao: string
  contaId: string | null
  valorMinimo: string | null
  valorMaximo: string | null
  categoriaId: string | null
  tipo: TipoDeTransacao | null
  prioridade: number
  ativa: boolean
}

export interface Transacao {
  id: string
  conta: { id: string; nome: string; instituicao: string; cor: string } | null
  loteId: string | null
  dataCompra: string
  dataPagamento: string
  ciclo: string
  valor: string
  descricao: string
  descricaoOriginal: string
  tipo: TipoDeTransacao
  categoria: { id: string; nome: string; pai: string | null } | null
  parcela: { numero: number; total: number } | null
  origem: 'claude' | 'manual' | 'open_finance' | 'csv'
  duplicata: { de: string } | null
  compensaId: string | null
  temAnotacao: boolean
  excluidaEm: string | null
}

export interface Lote {
  id: string
  fonte: string
  conta: { id: string; nome: string; instituicao: string; cor: string }
  documento: string
  periodo: { de: string; ate: string }
  vencimentoDaFatura: string | null
  total: string | null
  saldoInicial: string | null
  saldoFinal: string | null
  conferencia: 'total' | 'saldo' | 'nenhuma'
  status: 'aceito' | 'nao_conferido' | 'desfeito'
  itens: number
  novas: number
  duplicadas: number
  criadoEm: string
}

export interface Pendencias {
  total: number
  semCategoria: Transacao[]
  possiveisDuplicatas: { transacao: Transacao; original: Transacao | null }[]
  lotesNaoConferidos: Lote[]
}
