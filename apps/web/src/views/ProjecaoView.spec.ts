// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Projecao } from '@/api/tipos'
import { cicloProjetado } from '@/components/projecao/exemplos'
import { somarCiclos } from '@/formato'
import ProjecaoView from './ProjecaoView.vue'

function projecao(extra: Partial<Projecao> = {}): Projecao {
  return {
    hoje: '2026-11-15',
    cicloAtual: '2026-11',
    ultimosDados: '2026-11-14',
    configurada: true,
    parametros: { salario: '4600.00', aportePercentual: 10, orcamentoFlexiveis: '1420.00', folgaMinima: '300.00' },
    livreParaGastar: { orcamento: '1420.00', usado: '600.00', livre: '820.00' },
    congelamentoDoCicloAtual: null,
    ciclos: Array.from({ length: 12 }, (_, i) =>
      cicloProjetado(
        somarCiclos('2026-11', i),
        i === 1 ? { resultadoLiquido: '-120.00', veredito: 'negativo', flexiveisNosCartoes: { valor: '0.00', orcamentoDoCicloAnterior: '1420.00', gastoNoCicloAnterior: '1420.00' } } : {},
      ),
    ),
    ...extra,
  }
}

async function montar(resposta: Projecao) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) =>
    String(u) === '/api/projecao'
      ? new Response(JSON.stringify(resposta), { status: 200 })
      : new Response(JSON.stringify({ message: 'não' }), { status: 404 }),
  )
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/projecao', name: 'projecao', component: ProjecaoView },
      ...['inicio', 'abertura', 'transacoes', 'contas', 'configuracoes', 'login'].map((name) => ({
        path: `/${name}`,
        name,
        component: { template: '<p/>' },
      })),
    ],
  })
  await router.push('/projecao')
  const tela = mount(ProjecaoView, { global: { plugins: [router] } })
  await flushPromises()
  return tela
}

describe('projeção', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('mostra os 12 ciclos com resultado e veredito', async () => {
    const tela = await montar(projecao())
    const linhas = tela.findAll('tr.linha-ciclo')
    expect(linhas).toHaveLength(12)
    expect(linhas[0]!.text()).toContain('Novembro/26')
    expect(linhas[0]!.text()).toContain('R$ 4.600,00')
    expect(linhas[0]!.text()).toContain('-R$ 2.320,00')
    expect(linhas[0]!.find('.liquido').classes()).toContain('pos')
    expect(linhas[1]!.find('.liquido').classes()).toContain('neg')
    expect(linhas[1]!.text()).toContain('Negativo')
    expect(linhas[11]!.text()).toContain('Outubro/27')
    expect(tela.findAll('th.sec')).toHaveLength(3)
  })

  it('clicar num ciclo abre o detalhe: faturas com itens, flexíveis e fixas com o histórico', async () => {
    const tela = await montar(projecao())
    expect(tela.find('.detalhe').exists()).toBe(false)
    await tela.findAll('tr.linha-ciclo')[0]!.trigger('click')
    const detalhe = tela.find('.detalhe')
    expect(detalhe.text()).toContain('Nubank · Cartão')
    expect(detalhe.text()).toContain('a importar')
    expect(detalhe.text()).toContain('Flexíveis do ciclo anterior')
    expect(detalhe.text()).toContain('maior dos 3')
    expect(detalhe.text()).toContain('Ago/26 -R$ 150,00')
    expect(detalhe.text()).not.toContain('Mensalidade da academia')
    await detalhe.findAll('tr.click')[0]!.trigger('click')
    expect(tela.find('.detalhe').text()).toContain('Mensalidade da academia')

    // Outro ciclo fecha o primeiro; sem flexíveis pendentes, o bloco some.
    await tela.findAll('tr.linha-ciclo')[1]!.trigger('click')
    expect(tela.findAll('.detalhe')).toHaveLength(1)
    expect(tela.find('.detalhe').text()).not.toContain('Flexíveis do ciclo anterior')
  })

  it('sem salário configurado, pede para informar em Configurações', async () => {
    const tela = await montar(projecao({ configurada: false, ciclos: [] }))
    expect(tela.find('table').exists()).toBe(false)
    expect(tela.find('a[href="/configuracoes"]').exists()).toBe(true)
  })
})
