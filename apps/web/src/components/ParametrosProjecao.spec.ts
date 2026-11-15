// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FixaConfigurada, Parametros } from '@/api/tipos'
import ParametrosProjecao from './ParametrosProjecao.vue'

const parametros: Parametros = { salario: '4600.00', aportePercentual: 10, orcamentoFlexiveis: '1420.00', folgaMinima: '300.00' }
const luz: FixaConfigurada = {
  categoria: { id: 'cat-luz', nome: 'Luz', pai: 'Casa' },
  maiorDos3: '186.00',
  historico: [
    { ciclo: '2026-08', valor: '150.00' },
    { ciclo: '2026-09', valor: '186.00' },
    { ciclo: '2026-10', valor: '170.00' },
  ],
  valorFixo: null,
}
const internet: FixaConfigurada = {
  categoria: { id: 'cat-net', nome: 'Internet', pai: null },
  maiorDos3: '120.00',
  historico: [],
  valorFixo: '110.00',
}

function simular(fixas: FixaConfigurada[] = [luz, internet]) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, i) => {
    const url = String(u)
    const metodo = i?.method ?? 'GET'
    if (url === '/api/parametros' && metodo === 'GET') return new Response(JSON.stringify(parametros))
    if (url === '/api/parametros' && metodo === 'PUT') return new Response(JSON.stringify({ ...parametros, ...JSON.parse(String(i?.body)) }))
    if (url === '/api/fixas') return new Response(JSON.stringify(fixas))
    if (url.startsWith('/api/fixas/') && metodo === 'PUT') {
      const f = fixas.find((x) => url.endsWith(x.categoria.id))!
      return new Response(JSON.stringify({ ...f, valorFixo: JSON.parse(String(i?.body)).valor }))
    }
    return new Response(JSON.stringify({ message: 'não' }), { status: 404 })
  })
}

async function montar() {
  const tela = mount(ParametrosProjecao)
  await flushPromises()
  return tela
}

const envios = (f: ReturnType<typeof simular>, prefixo: string) =>
  f.mock.calls.filter(([u, i]) => String(u).startsWith(prefixo) && i?.method === 'PUT')

describe('parâmetros da projeção', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('salvar envia só o que mudou, no formato da API', async () => {
    const fetchFalso = simular()
    const tela = await montar()
    const campos = tela.findAll('.form input')
    expect((campos[0]!.element as HTMLInputElement).value).toBe('4600,00')
    await tela.find('.form').trigger('submit')
    await flushPromises()
    expect(envios(fetchFalso, '/api/parametros')).toHaveLength(0)
    expect(tela.text()).toContain('Sem alterações')

    await campos[1]!.setValue('12,5')
    await campos[2]!.setValue('1.500')
    await tela.find('.form').trigger('submit')
    await flushPromises()
    const [envio] = envios(fetchFalso, '/api/parametros')
    expect(JSON.parse(String(envio?.[1]?.body))).toEqual({ aportePercentual: 12.5, orcamentoFlexiveis: '1500.00' })
    expect(tela.text()).toContain('Salvo')
  })

  it('valor inválido não é enviado', async () => {
    const fetchFalso = simular()
    const tela = await montar()
    await tela.findAll('.form input')[3]!.setValue('abc')
    await tela.find('.form').trigger('submit')
    await flushPromises()
    expect(envios(fetchFalso, '/api/parametros')).toHaveLength(0)
    expect(tela.text()).toContain('Folga mínima inválida')
  })

  it('fixas: mostra o histórico, fixa um valor e limpar o campo volta ao cálculo (null)', async () => {
    const fetchFalso = simular()
    const tela = await montar()
    expect(tela.text()).toContain('Casa · Luz')
    expect(tela.text()).toContain('Ago/26 R$ 150,00')

    const [campoLuz, campoNet] = tela.findAll('.fixo input')
    expect((campoNet!.element as HTMLInputElement).value).toBe('110,00')
    await campoLuz!.setValue('200,00')
    await campoNet!.setValue('')
    await flushPromises()

    const [paraLuz, paraNet] = envios(fetchFalso, '/api/fixas/')
    expect(String(paraLuz?.[0])).toBe('/api/fixas/cat-luz')
    expect(JSON.parse(String(paraLuz?.[1]?.body))).toEqual({ valor: '200.00' })
    expect(String(paraNet?.[0])).toBe('/api/fixas/cat-net')
    expect(JSON.parse(String(paraNet?.[1]?.body))).toEqual({ valor: null })
  })

  it('sem categorias intermitentes, explica onde definir a natureza', async () => {
    simular([])
    const tela = await montar()
    expect(tela.text()).toContain('A natureza "intermitente" se define em Categorias')
  })
})
