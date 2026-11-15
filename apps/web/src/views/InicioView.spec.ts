// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { CicloProjetado, Projecao } from '@/api/tipos'
import InicioView from './InicioView.vue'

// Dados fictícios.
const nubank = { id: 'c1', nome: 'Roxinho', instituicao: 'Nubank', cor: '#8A05BE' }
const inter = { id: 'c2', nome: 'Black', instituicao: 'Inter', cor: '#FF7A00' }

function cicloProjetado(id: string, inicio: string, fim: string, extra: Partial<CicloProjetado> = {}): CicloProjetado {
  return {
    ciclo: { id, inicio, fim, salarioEsperado: inicio, salarioReal: null, creditoDoVale: null },
    receita: '4600.00',
    dizimo: '-460.00',
    faturas: [
      {
        conta: nubank,
        fechamento: '2026-11-01',
        vencimento: '2026-11-09',
        status: 'a_importar',
        valor: '-1146.00',
        realizado: '-900.00',
        itens: [
          { descricao: 'Mercado do bairro', valor: '-900.00', origem: 'realizado' },
          { descricao: 'Tênis 2/3', valor: '-246.00', origem: 'parcela' },
        ],
      },
      {
        conta: inter,
        fechamento: '2026-10-30',
        vencimento: '2026-11-04',
        status: 'fechada',
        valor: '-874.00',
        realizado: '-874.00',
        itens: [{ descricao: 'Farmácia', valor: '-874.00', origem: 'realizado' }],
      },
    ],
    flexiveisNosCartoes: { valor: '0.00', orcamentoDoCicloAnterior: '1420.00', gastoNoCicloAnterior: '1420.00' },
    fixas: [
      { descricao: 'Luz', categoriaId: 'k1', valor: '-186.00', base: 'maior_3', historico: [] },
      { descricao: 'Internet', categoriaId: 'k2', valor: '-120.00', base: 'fixo', historico: [] },
    ],
    totais: { faturas: '-2020.00', fixas: '-306.00' },
    aporte: '-460.00',
    aportePercentual: 10,
    orcamentoFlexiveis: '1420.00',
    resultadoLiquido: '1354.00',
    veredito: 'positivo',
    ajustado: false,
    ...extra,
  }
}

function projecao(extra: Partial<Projecao> = {}): Projecao {
  return {
    hoje: '2026-11-02',
    cicloAtual: '2026-11',
    ultimosDados: '2026-11-01',
    configurada: true,
    parametros: { salario: '4600.00', aportePercentual: 10, orcamentoFlexiveis: '1420.00', folgaMinima: '300.00' },
    livreParaGastar: { orcamento: '1420.00', usado: '380.00', livre: '1040.00' },
    congelamentoDoCicloAtual: {
      ciclo: '2026-11',
      congeladaEm: '2026-10-30T22:10:00Z',
      incompleta: false,
      lotesAceitos: 3,
      contasEsperadas: 3,
      pendencias: 0,
      resultadoLiquido: '1080.00',
      aporte: '-460.00',
      orcamentoFlexiveis: '1420.00',
    },
    ciclos: [
      cicloProjetado('2026-11', '2026-10-30', '2026-11-29'),
      cicloProjetado('2026-12', '2026-11-30', '2026-12-30', { resultadoLiquido: '1500.00' }),
      cicloProjetado('2027-01', '2026-12-31', '2027-01-29', { resultadoLiquido: '-200.00' }),
    ],
    ...extra,
  }
}

let respostas: Record<string, unknown> = {}

function responder(url: string) {
  const corpo = respostas[url]
  if (corpo === undefined) return new Response(JSON.stringify({ message: `sem resposta para ${url}` }), { status: 404 })
  return new Response(JSON.stringify(corpo), { status: 200 })
}

async function montar() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'inicio', component: InicioView },
      ...['abertura', 'projecao', 'transacoes', 'contas', 'configuracoes', 'login'].map((name) => ({
        path: `/${name}`,
        name,
        component: { template: '<p/>' },
      })),
    ],
  })
  await router.push('/')
  const tela = mount(InicioView, { global: { plugins: [router] } })
  await flushPromises()
  return { tela, router }
}

describe('tela inicial', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    respostas = {
      '/api/projecao': projecao(),
      '/api/pendencias': { total: 3, semCategoria: [], possiveisDuplicatas: [], lotesNaoConferidos: [] },
    }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => responder(String(u)))
  })

  it('mostra os indicadores com os valores formatados e a data dos últimos dados', async () => {
    const { tela } = await montar()
    expect(tela.text()).toContain('Ciclo Novembro/26')
    expect(tela.text()).toContain('30/10 – 29/11 · dia 4/31')
    expect(tela.find('.atualizacao').text()).toContain('dados até 01/11')

    const livre = tela.find('.kpi.main')
    expect(livre.text()).toContain('Livre para gastar')
    expect(livre.find('.val').text()).toBe('R$1.040')
    expect(livre.text()).toContain('até 29/11')
    expect(livre.text()).toContain('R$ 380 usados')
    expect(livre.text()).toContain('orçamento R$ 1.420')
    expect(livre.find('.meter i').attributes('style')).toContain('width: 26.7')

    expect(tela.find('.kpi.resultado .val').text()).toBe('R$1.354')
    const aporte = tela.find('.kpi.aporte')
    expect(aporte.find('.val').text()).toBe('R$460')
    expect(aporte.text()).toContain('10%')
    expect(tela.text()).not.toContain('Flash')
  })

  it('sem dados importados, avisa no lugar da data', async () => {
    respostas['/api/projecao'] = projecao({ ultimosDados: null })
    const { tela } = await montar()
    expect(tela.find('.atualizacao').text()).toContain('sem dados importados')
  })

  it('mostra a variação do resultado contra a projeção congelada', async () => {
    const { tela } = await montar()
    const chip = tela.find('.kpi.resultado .variacao')
    expect(chip.text()).toBe('▲ R$ 274')
    expect(chip.classes()).toContain('up')
  })

  it('variação negativa aparece com ▼; sem congelamento, não há variação', async () => {
    respostas['/api/projecao'] = projecao({
      congelamentoDoCicloAtual: { ...projecao().congelamentoDoCicloAtual!, resultadoLiquido: '1474.00' },
    })
    let { tela } = await montar()
    expect(tela.find('.kpi.resultado .variacao').text()).toBe('▼ R$ 120')
    expect(tela.find('.kpi.resultado .variacao').classes()).toContain('down')

    respostas['/api/projecao'] = projecao({ congelamentoDoCicloAtual: null })
    ;({ tela } = await montar())
    expect(tela.find('.kpi.resultado .variacao').exists()).toBe(false)
  })

  it('distribuição: valores como saídas e clique na linha abre os itens', async () => {
    const { tela } = await montar()
    const dist = tela.find('.distribuicao')
    expect(dist.find('h2').text()).toContain('R$ 4.600,00')
    const faturas = dist.find('tr[data-chave="faturas"]')
    expect(faturas.text()).toContain('Faturas')
    expect(faturas.text()).toContain('44%')
    expect(faturas.text()).toContain('R$ 2.020,00')
    expect(dist.find('tr[data-chave="resultado"]').text()).toContain('R$ 1.354,00')
    expect(dist.text()).not.toContain('Mercado do bairro')

    await faturas.trigger('click')
    expect(dist.text()).toContain('Fatura Nubank')
    expect(dist.text()).toContain('Fatura Inter')
    expect(dist.text()).toContain('R$ 1.146,00')
    await dist.find('.fatura button').trigger('click')
    expect(dist.text()).toContain('Mercado do bairro')
    expect(dist.text()).toContain('Tênis 2/3')

    await dist.find('tr[data-chave="fixas"]').trigger('click')
    expect(dist.text()).not.toContain('Fatura Nubank')
    expect(dist.text()).toContain('Luz')
    expect(dist.text()).toContain('maior dos 3')
    expect(dist.text()).toContain('R$ 186,00')

    await dist.find('tr[data-chave="dizimo"]').trigger('click')
    expect(dist.find('tr.detalhe').findAll('li')).toHaveLength(1)
    expect(dist.find('tr.detalhe').text()).toContain('R$ 460,00')
  })

  it('distribuição: flexíveis fora das faturas listadas entram como linha à parte', async () => {
    const base = cicloProjetado('2026-11', '2026-10-30', '2026-11-29', { totais: { faturas: '-2520.00', fixas: '-306.00' } })
    respostas['/api/projecao'] = projecao({ ciclos: [base] })
    const { tela } = await montar()
    await tela.find('tr[data-chave="faturas"]').trigger('click')
    expect(tela.find('.distribuicao').text()).toContain('Flexíveis nos cartões')
    expect(tela.find('.distribuicao').text()).toContain('R$ 500,00')
  })

  it('saídas do ciclo: faturas com status, vencimento e cor da instituição; fixas projetadas', async () => {
    const { tela } = await montar()
    const linhas = tela.findAll('.saidas tr')
    expect(linhas).toHaveLength(4)
    // Ordenadas pelo vencimento: Inter (04/11) antes de Nubank (09/11).
    expect(linhas[0]!.text()).toContain('Fatura Inter')
    expect(linhas[0]!.text()).toContain('fechada')
    expect(linhas[0]!.text()).toContain('04/11')
    expect(linhas[0]!.attributes('style')).toContain('--bk: #FF7A00')
    expect(linhas[1]!.text()).toContain('a importar')
    expect(linhas[1]!.text()).toContain('R$ 1.146,00')
    expect(linhas[2]!.text()).toContain('Luz')
    expect(linhas[2]!.text()).toContain('projetada')
  })

  it('gráfico: 12 ciclos por padrão, seletor de 6 e dica com receita, resultado e margem', async () => {
    const { tela } = await montar()
    const grafico = tela.find('.grafico')
    expect(grafico.findAll('rect.barra')).toHaveLength(3)
    expect(grafico.find('rect.barra.neg').exists()).toBe(true)
    await grafico.findAll('.alvo')[0]!.trigger('mouseenter')
    const dica = grafico.find('.tt')
    expect(dica.text()).toContain('Ciclo Novembro/26 · atual')
    expect(dica.text()).toContain('R$ 4.600,00')
    expect(dica.text()).toContain('R$ 1.354,00')
    expect(dica.text()).toContain('29,4%')
    await grafico.findAll('.alvo')[0]!.trigger('mouseleave')
    expect(grafico.find('.tt').exists()).toBe(false)

    const muitos = Array.from({ length: 12 }, (_, i) => cicloProjetado(`2027-${String(i + 1).padStart(2, '0')}`, '2027-01-01', '2027-01-30'))
    respostas['/api/projecao'] = projecao({ ciclos: muitos })
    const outra = (await montar()).tela.find('.grafico')
    expect(outra.findAll('rect.barra')).toHaveLength(12)
    await outra.findAll('.seg button')[0]!.trigger('click')
    expect(outra.findAll('rect.barra')).toHaveLength(6)
  })

  it('sem salário configurado, mostra o card que leva às Configurações', async () => {
    respostas['/api/projecao'] = projecao({ configurada: false, ciclos: [], congelamentoDoCicloAtual: null })
    const { tela } = await montar()
    expect(tela.find('.configurar').text()).toContain('informe o salário')
    expect(tela.find('.configurar a').attributes('href')).toBe('/configuracoes')
    expect(tela.find('.kpis').exists()).toBe(false)
    expect(tela.text()).toContain('Ciclo Novembro/26')
  })

  it('contador de pendências leva à aba de pendências das transações', async () => {
    const { tela } = await montar()
    const icone = tela.find('a.ibtn')
    expect(icone.find('.badge').text()).toBe('3')
    expect(icone.attributes('href')).toBe('/transacoes?aba=pendencias')
  })

  it('sem pendências, o ícone fica sem contador; falha na projeção mostra o erro', async () => {
    respostas['/api/pendencias'] = { total: 0, semCategoria: [], possiveisDuplicatas: [], lotesNaoConferidos: [] }
    delete respostas['/api/projecao']
    const { tela } = await montar()
    expect(tela.find('a.ibtn .badge').exists()).toBe(false)
    expect(tela.find('.erro').text()).toContain('sem resposta para /api/projecao')
  })
})
