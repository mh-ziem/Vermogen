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

// ----- Projeção, tela inicial e abertura do ciclo (HU-15 a HU-17) -----------------
// Convenção de sinal do app: positivo entra, negativo sai. Receita é positiva; dízimo,
// faturas, fixas e aporte vêm negativos; o resultado líquido tem o sinal do que sobra.
// Orçamentos (orcamentoFlexiveis, orcamento, usado, livre) são positivos.

/** Fatura de um cartão paga no ciclo. fechada = já fechou e foi importada (valor real);
 * a_importar = já fechou, mas o documento ainda não chegou (estimativa); projetada = ainda aberta. */
export type StatusDaFatura = 'fechada' | 'a_importar' | 'projetada'
export type Veredito = 'positivo' | 'moderado' | 'negativo'

/** Linha do detalhamento por clique (DS-07). */
export interface ItemDaProjecao {
  descricao: string
  valor: string
  /** realizado = já gravado; parcela = parcela futura conhecida; recorrente = fixa do cartão
   * estimada; estimativa = orçamento de flexíveis ainda não gasto. */
  origem: 'realizado' | 'parcela' | 'recorrente' | 'estimativa'
}

export interface FaturaProjetada {
  conta: { id: string; nome: string; instituicao: string; cor: string }
  fechamento: string
  vencimento: string
  status: StatusDaFatura
  valor: string
  /** Parte já gravada (transações da fatura). */
  realizado: string
  itens: ItemDaProjecao[]
}

/** Fixa ou intermitente fora do cartão (RN-10), ou parcela fora do cartão. */
export interface FixaProjetada {
  descricao: string
  categoriaId: string | null
  valor: string
  /** fixo = valor fixado por você; maior_3 = maior dos últimos 3 ciclos; realizado = o gravado no
   * ciclo já passou da estimativa; parcela = parcela futura fora do cartão. */
  base: 'fixo' | 'maior_3' | 'realizado' | 'parcela'
  /** Valores dos 3 ciclos usados no cálculo, do mais antigo ao mais recente (vazio se não se aplica). */
  historico: { ciclo: string; valor: string }[]
}

export interface CicloProjetado {
  ciclo: Ciclo
  receita: string
  dizimo: string
  faturas: FaturaProjetada[]
  /** Orçamento de flexíveis do ciclo anterior ainda não gasto, pago nas faturas deste ciclo (RN-11).
   * Já está somado em totais.faturas. Zero quando todas as faturas do ciclo já fecharam. */
  flexiveisNosCartoes: { valor: string; orcamentoDoCicloAnterior: string; gastoNoCicloAnterior: string }
  fixas: FixaProjetada[]
  totais: { faturas: string; fixas: string }
  aporte: string
  aportePercentual: number
  /** Orçamento para gastar durante este ciclo (pago no próximo, pelas faturas). */
  orcamentoFlexiveis: string
  /** receita + dizimo + totais.faturas + totais.fixas + aporte (HU-15 CA2). */
  resultadoLiquido: string
  veredito: Veredito
  /** true quando aporte ou orçamento deste ciclo foram ajustados na abertura. */
  ajustado: boolean
}

export interface Parametros {
  salario: string | null
  aportePercentual: number
  orcamentoFlexiveis: string
  folgaMinima: string
}

export interface Congelamento {
  ciclo: string
  congeladaEm: string
  incompleta: boolean
  lotesAceitos: number
  contasEsperadas: number
  pendencias: number
  resultadoLiquido: string
  aporte: string
  orcamentoFlexiveis: string
}

export interface Projecao {
  hoje: string
  cicloAtual: string
  /** Data da transação mais recente gravada (HU-16 CA3, V-01); null sem dados. */
  ultimosDados: string | null
  /** false enquanto o salário não foi configurado: os ciclos vêm vazios. */
  configurada: boolean
  parametros: Parametros
  livreParaGastar: { orcamento: string; usado: string; livre: string }
  /** Projeção congelada do ciclo atual, se a abertura já foi feita (para a variação do resultado). */
  congelamentoDoCicloAtual: Congelamento | null
  /** 12 ciclos a partir do atual (RN-06). */
  ciclos: CicloProjetado[]
}

export type StatusDaEntrada = 'aceito' | 'nao_conferido' | 'aguardando'

export interface Abertura {
  ciclo: Ciclo
  /** Ciclo cujos documentos entram na etapa 1. */
  anterior: string
  entrada: {
    conta: { id: string; nome: string; instituicao: string; cor: string; tipo: TipoDeConta }
    lotes: Lote[]
    status: StatusDaEntrada
  }[]
  pendencias: { semCategoria: number; possiveisDuplicatas: number; lotesNaoConferidos: number; total: number }
  plano: { aporte: string; orcamentoFlexiveis: string; ajustado: boolean }
  distribuicao: CicloProjetado
  folgaMinima: string
  congelamento: Congelamento | null
}

/** Uma categoria intermitente com o cálculo da RN-10 e o valor fixado, se houver. */
export interface FixaConfigurada {
  categoria: { id: string; nome: string; pai: string | null }
  maiorDos3: string
  historico: { ciclo: string; valor: string }[]
  valorFixo: string | null
}
