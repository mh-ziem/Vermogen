// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Abertura } from '@/api/tipos'
import { abertura, congelamento } from '@/components/projecao/exemplos'
import AberturaView from './AberturaView.vue'

type Respondedor = (url: string, init?: RequestInit) => Response | undefined

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status })

function simular(inicial: Abertura, extra: Respondedor = () => undefined) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, i) => {
    const url = String(u)
    const r = extra(url, i)
    if (r) return r
    if (url === '/api/abertura' && !i?.method) return json(inicial)
    if (url === '/api/abertura' && i?.method === 'GET') return json(inicial)
    return json({ message: `sem resposta para ${i?.method} ${url}` }, 404)
  })
}

async function montar() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/abertura', name: 'abertura', component: AberturaView },
      ...['inicio', 'projecao', 'transacoes', 'contas', 'configuracoes', 'login'].map((name) => ({
        path: `/${name}`,
        name,
        component: { template: '<p/>' },
      })),
    ],
  })
  await router.push('/abertura')
  const tela = mount(AberturaView, { global: { plugins: [router] } })
  await flushPromises()
  return tela
}

const botao = (tela: Awaited<ReturnType<typeof montar>>, texto: string) =>
  tela.findAll('button').find((b) => b.text() === texto)!

describe('abertura do ciclo', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('mostra as 4 etapas e navega por Avançar, Voltar e clique na etapa', async () => {
    simular(abertura())
    const tela = await montar()
    const etapas = tela.findAll('.step')
    expect(etapas).toHaveLength(4)
    expect(etapas.map((e) => e.find('.n').text())).toEqual(['ETAPA 1', 'ETAPA 2', 'ETAPA 3', 'ETAPA 4'])
    expect(tela.text()).not.toContain('Fechamento')
    expect(etapas[0]!.text()).toContain('1/2 contas')
    expect(etapas[1]!.text()).toContain('3 em aberto')

    // Etapa 1: entrada de dados do ciclo anterior.
    expect(tela.text()).toContain('Entrada de dados · ciclo Novembro/26')
    expect(tela.text()).toContain('Via Claude (MCP)')
    expect(tela.text()).toContain('Fatura Inter')
    expect(tela.text()).toContain('Aguardando')
    expect(tela.find('.toolbar a[href="/transacoes"]').text()).toContain('Lançamento manual')
    expect(botao(tela, 'Voltar').attributes('disabled')).toBeDefined()

    // Etapa 2: pendências, resolvidas na tela de transações.
    await botao(tela, 'Avançar').trigger('click')
    expect(tela.find('.pgrid').text()).toContain('Sem categoria')
    expect(tela.find('.acoes a[href="/transacoes?aba=pendencias"]').text()).toBe('Resolver')

    // Clique direto na etapa 4.
    await tela.findAll('.step')[3]!.trigger('click')
    expect(tela.text()).toContain('Congelar projeção do ciclo')

    await botao(tela, 'Voltar').trigger('click')
    expect(tela.text()).toContain('Distribuição de capital · ciclo Dezembro/26')
    expect(tela.findAll('.step')[2]!.classes()).toContain('cur')
  })

  it('confirmação: sinaliza "Incompleto" com pendências, mas deixa congelar', async () => {
    const a = abertura()
    a.entrada = a.entrada.map((e) => ({ ...e, status: 'aceito' as const }))
    simular(a)
    const tela = await montar()
    await tela.findAll('.step')[3]!.trigger('click')
    const linhas = tela.findAll('.resumo tr')
    expect(linhas[0]!.text()).toContain('2/2')
    expect(linhas[0]!.text()).toContain('Completo')
    expect(linhas[1]!.text()).toContain('Seguem para o ciclo')
    expect(linhas[2]!.text()).toContain('10% do salário')
    expect(tela.find('.foot .chip').text()).toBe('Incompleto')
    expect(botao(tela, 'Congelar projeção do ciclo').attributes('disabled')).toBeUndefined()
  })

  it('distribuição: clicar numa fatura abre os itens; flexíveis do ciclo anterior em linha própria', async () => {
    simular(abertura())
    const tela = await montar()
    await tela.findAll('.step')[2]!.trigger('click')
    expect(tela.text()).toContain('Flexíveis do ciclo anterior')
    expect(tela.text()).toContain('Positivo')
    expect(tela.text()).not.toContain('Mensalidade da academia')
    const fatura = tela.findAll('tr.click').find((t) => t.text().includes('Fatura Nubank'))!
    expect(fatura.text()).toContain('a importar')
    await fatura.trigger('click')
    expect(tela.text()).toContain('Mensalidade da academia')
    expect(tela.text()).toContain('-R$ 290,00')
  })

  it('editar o aporte envia o PUT com o valor no formato da API e mostra a distribuição devolvida', async () => {
    const depois = abertura({ plano: { aporte: '500.00', orcamentoFlexiveis: '1420.00', ajustado: true } })
    const fetchFalso = simular(abertura(), (url, i) =>
      url === '/api/abertura/plano' && i?.method === 'PUT' ? json(depois) : undefined,
    )
    const tela = await montar()
    await tela.findAll('.step')[2]!.trigger('click')
    const campo = tela.find('input[aria-label="Aporte do ciclo (R$)"]')
    expect((campo.element as HTMLInputElement).value).toBe('460,00')
    await campo.setValue('500,00')
    await flushPromises()
    const envio = fetchFalso.mock.calls.find(([u, i]) => String(u) === '/api/abertura/plano' && i?.method === 'PUT')
    expect(JSON.parse(String(envio?.[1]?.body))).toEqual({ aporte: '500.00', orcamentoFlexiveis: '1420.00' })
    expect(tela.find('h2').text()).toContain('Ajustado')
    expect(tela.findAll('.step')[2]!.text()).toContain('Ajustada')
  })

  it('editar o orçamento: mostra o erro da API e não envia valor inválido', async () => {
    const fetchFalso = simular(abertura(), (url, i) =>
      url === '/api/abertura/plano' && i?.method === 'PUT' ? json({ message: 'Orçamento acima da receita' }, 400) : undefined,
    )
    const tela = await montar()
    await tela.findAll('.step')[2]!.trigger('click')
    const campo = tela.find('input[aria-label="Orçamento de flexíveis do ciclo (R$)"]')
    await campo.setValue('-10')
    await flushPromises()
    expect(fetchFalso.mock.calls.some(([, i]) => i?.method === 'PUT')).toBe(false)
    expect(tela.text()).toContain('Valor inválido')

    await campo.setValue('9.999,00')
    await flushPromises()
    const envio = fetchFalso.mock.calls.find(([, i]) => i?.method === 'PUT')
    expect(JSON.parse(String(envio?.[1]?.body))).toEqual({ aporte: '460.00', orcamentoFlexiveis: '9999.00' })
    expect(tela.find('[role="alert"]').text()).toBe('Orçamento acima da receita')
  })

  it('congelar envia o POST e mostra a data e a hora', async () => {
    const fetchFalso = simular(abertura(), (url, i) =>
      url === '/api/abertura/congelar' && i?.method === 'POST' ? json(congelamento(), 201) : undefined,
    )
    const tela = await montar()
    await tela.findAll('.step')[3]!.trigger('click')
    await botao(tela, 'Congelar projeção do ciclo').trigger('click')
    await flushPromises()
    expect(fetchFalso.mock.calls.filter(([u]) => String(u) === '/api/abertura/congelar')).toHaveLength(1)
    expect(tela.text()).toContain('Projeção congelada em 30/11 às 10:05')
    expect(tela.text()).toContain('Incompleta')
    expect(tela.findAll('.step')[3]!.text()).toContain('Congelada 30/11')
    expect(botao(tela, 'Congelar de novo')).toBeDefined()
  })

  it('"Congelar de novo" pede confirmação em dois cliques', async () => {
    const fetchFalso = simular(abertura({ congelamento: congelamento() }), (url, i) =>
      url === '/api/abertura/congelar' && i?.method === 'POST'
        ? json(congelamento({ congeladaEm: '2026-12-01T18:30:00Z', incompleta: false }), 201)
        : undefined,
    )
    const tela = await montar()
    await tela.findAll('.step')[3]!.trigger('click')
    expect(tela.text()).toContain('Projeção congelada em 30/11 às 10:05')
    await botao(tela, 'Congelar de novo').trigger('click')
    expect(fetchFalso.mock.calls.some(([u]) => String(u) === '/api/abertura/congelar')).toBe(false)
    await botao(tela, 'Confirmar: substituir a projeção congelada').trigger('click')
    await flushPromises()
    expect(fetchFalso.mock.calls.filter(([u]) => String(u) === '/api/abertura/congelar')).toHaveLength(1)
    expect(tela.text()).toContain('Projeção congelada em 01/12 às 15:30')
    expect(tela.text()).not.toContain('Incompleta')
    expect(botao(tela, 'Congelar de novo')).toBeDefined()
  })
})
