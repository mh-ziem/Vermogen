/** Dados fictícios para os testes da projeção e da abertura (não usados pela aplicação). */
import type { Abertura, CicloProjetado, Congelamento, Lote } from '@/api/tipos'
import { somarCiclos } from '@/formato'

const nubank = { id: 'c-nu', nome: 'Cartão', instituicao: 'Nubank', cor: '#8A05BE' }
const inter = { id: 'c-in', nome: 'Cartão', instituicao: 'Inter', cor: '#FF9A3D' }

export function cicloProjetado(id: string, extra: Partial<CicloProjetado> = {}): CicloProjetado {
  return {
    ciclo: { id, inicio: `${somarCiclos(id, -1)}-30`, fim: `${id}-29`, salarioEsperado: `${somarCiclos(id, -1)}-30`, salarioReal: null, creditoDoVale: null },
    receita: '4600.00',
    dizimo: '-460.00',
    faturas: [
      {
        conta: nubank,
        fechamento: `${id}-01`,
        vencimento: `${id}-08`,
        status: 'a_importar',
        valor: '-1146.00',
        realizado: '-679.00',
        itens: [
          { descricao: 'Mensalidade da academia', valor: '-290.00', origem: 'parcela' },
          { descricao: 'Mercado', valor: '-389.00', origem: 'realizado' },
          { descricao: 'Streaming', valor: '-60.00', origem: 'recorrente' },
        ],
      },
      {
        conta: inter,
        fechamento: `${id}-05`,
        vencimento: `${id}-12`,
        status: 'projetada',
        valor: '-874.00',
        realizado: '0.00',
        itens: [{ descricao: 'Supermercado', valor: '-412.00', origem: 'estimativa' }],
      },
    ],
    flexiveisNosCartoes: { valor: '-300.00', orcamentoDoCicloAnterior: '1420.00', gastoNoCicloAnterior: '1120.00' },
    fixas: [
      {
        descricao: 'Luz',
        categoriaId: 'cat-luz',
        valor: '-186.00',
        base: 'maior_3',
        historico: [
          { ciclo: somarCiclos(id, -3), valor: '-150.00' },
          { ciclo: somarCiclos(id, -2), valor: '-186.00' },
          { ciclo: somarCiclos(id, -1), valor: '-170.00' },
        ],
      },
      { descricao: 'Internet', categoriaId: 'cat-net', valor: '-120.00', base: 'fixo', historico: [] },
    ],
    totais: { faturas: '-2320.00', fixas: '-306.00' },
    aporte: '-460.00',
    aportePercentual: 10,
    orcamentoFlexiveis: '1420.00',
    resultadoLiquido: '1054.00',
    veredito: 'positivo',
    ajustado: false,
    ...extra,
  }
}

function lote(id: string, conta: typeof nubank, extra: Partial<Lote> = {}): Lote {
  return {
    id,
    fonte: 'claude',
    conta,
    documento: `Fatura ${conta.instituicao}`,
    periodo: { de: '2026-10-01', ate: '2026-10-31' },
    vencimentoDaFatura: '2026-11-08',
    total: '-874.12',
    saldoInicial: null,
    saldoFinal: null,
    conferencia: 'total',
    status: 'aceito',
    itens: 38,
    novas: 38,
    duplicadas: 0,
    criadoEm: '2026-11-02T12:00:00Z',
    ...extra,
  }
}

export function abertura(extra: Partial<Abertura> = {}): Abertura {
  const distribuicao = cicloProjetado('2026-12')
  return {
    ciclo: distribuicao.ciclo,
    anterior: '2026-11',
    entrada: [
      { conta: { ...inter, tipo: 'cartao' }, lotes: [lote('l1', inter)], status: 'aceito' },
      { conta: { ...nubank, tipo: 'cartao' }, lotes: [], status: 'aguardando' },
    ],
    pendencias: { semCategoria: 2, possiveisDuplicatas: 1, lotesNaoConferidos: 0, total: 3 },
    plano: { aporte: '460.00', orcamentoFlexiveis: '1420.00', ajustado: false },
    distribuicao,
    folgaMinima: '300.00',
    congelamento: null,
    ...extra,
  }
}

export function congelamento(extra: Partial<Congelamento> = {}): Congelamento {
  return {
    ciclo: '2026-12',
    congeladaEm: '2026-11-30T13:05:00Z',
    incompleta: true,
    lotesAceitos: 1,
    contasEsperadas: 2,
    pendencias: 3,
    resultadoLiquido: '1054.00',
    aporte: '-460.00',
    orcamentoFlexiveis: '1420.00',
    ...extra,
  }
}
