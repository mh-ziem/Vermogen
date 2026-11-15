// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import TransacoesView from './TransacoesView.vue'

const conta = { id: 'c1', nome: 'Cartão', tipo: 'cartao', ativa: true, instituicao: { id: 'i1', nome: 'Nubank', cor: '#8A05BE', ativa: true }, finalidade: null, cartao: null }
const transacao = (id: string, extra: object = {}) => ({
  id,
  conta: { id: 'c1', nome: 'Cartão', instituicao: 'Nubank', cor: '#8A05BE' },
  loteId: 'l1',
  dataCompra: '2026-10-28',
  dataPagamento: '2026-11-09',
  ciclo: '2026-11',
  valor: '-47.90',
  descricao: 'Padaria',
  descricaoOriginal: 'Padaria',
  tipo: 'despesa',
  categoria: null,
  parcela: null,
  origem: 'claude',
  duplicata: null,
  compensaId: null,
  temAnotacao: false,
  excluidaEm: null,
  ...extra,
})
const lote = { id: 'l1', fonte: 'claude', conta: { id: 'c1', nome: 'Cartão', instituicao: 'Nubank', cor: '#8A05BE' }, documento: 'Fatura Nubank', periodo: { de: '2026-10-01', ate: '2026-10-31' }, vencimentoDaFatura: '2026-11-09', total: '-47.90', saldoInicial: null, saldoFinal: null, conferencia: 'total', status: 'aceito', itens: 1, novas: 1, duplicadas: 0, criadoEm: '2026-11-15T00:00:00Z' }

const respostas: Record<string, unknown> = {
  '/api/ciclos/atual': { id: '2026-11', inicio: '2026-10-30', fim: '2026-11-29', salarioEsperado: '2026-10-30', salarioReal: null, creditoDoVale: '2026-11-25' },
  '/api/ciclos?de=2026-11&ate=2026-11': [{ id: '2026-11', inicio: '2026-10-30', fim: '2026-11-29', salarioEsperado: '2026-10-30', salarioReal: null, creditoDoVale: '2026-11-25' }],
  '/api/contas?incluirInativas=true': [conta],
  '/api/categorias': [{ id: 'cat1', nome: 'Mercado', paiId: null, natureza: 'flexivel', ativa: true }],
  '/api/transacoes?ciclo=2026-11&limite=500': { transacoes: [transacao('t1'), transacao('t2', { valor: '1500.00', descricao: 'Salário', tipo: 'receita', categoria: { id: 'cat1', nome: 'Mercado', pai: null } })], total: 2, soma: '1452.10' },
  '/api/pendencias': {
    total: 2,
    semCategoria: [transacao('t1')],
    possiveisDuplicatas: [{ transacao: transacao('t3', { duplicata: { de: 't1' } }), original: transacao('t1') }],
    lotesNaoConferidos: [],
  },
  '/api/lotes?ciclo=2026-11': [lote],
}

function responder(url: string, init?: RequestInit) {
  if (init?.method === 'POST' && url === '/api/pendencias/resolver') return new Response(JSON.stringify({ ok: true }), { status: 200 })
  const corpo = respostas[url]
  if (corpo === undefined) return new Response(JSON.stringify({ message: `sem resposta para ${url}` }), { status: 404 })
  return new Response(JSON.stringify(corpo), { status: 200 })
}

async function montar() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/transacoes', name: 'transacoes', component: TransacoesView },
      ...['inicio', 'contas', 'configuracoes', 'login'].map((name) => ({ path: `/${name}`, name, component: { template: '<p/>' } })),
    ],
  })
  await router.push('/transacoes')
  const tela = mount(TransacoesView, { global: { plugins: [router] } })
  await flushPromises()
  return tela
}

describe('tela de transações', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('mostra as transações do ciclo com valor em reais e a soma', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, i) => responder(String(u), i))
    const tela = await montar()
    expect(tela.text()).toContain('Padaria')
    expect(tela.text()).toContain('-R$ 47,90')
    expect(tela.text()).toContain('R$ 1.452,10')
    expect(tela.text()).toContain('sem categoria')
    expect(tela.find('.badge').text()).toBe('2')
  })

  it('pendências: resolver categoria envia a regra quando informada', async () => {
    const fetchFalso = vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, i) => responder(String(u), i))
    const tela = await montar()
    await tela.findAll('.abas button')[1]!.trigger('click')
    expect(tela.text()).toContain('Possíveis duplicatas')
    await tela.find('.acoes-pend select').setValue('cat1')
    await tela.find('.acoes-pend .regra').setValue('padaria')
    await tela.find('.acoes-pend .btn.primario').trigger('click')
    await flushPromises()
    const envio = fetchFalso.mock.calls.find(([u]) => String(u) === '/api/pendencias/resolver')
    expect(JSON.parse(String(envio?.[1]?.body))).toEqual({ tipo: 'categorizar', transacaoId: 't1', categoriaId: 'cat1', criarRegra: { padrao: 'padaria' } })
  })

  it('lotes: desfazer pede confirmação antes de enviar', async () => {
    const fetchFalso = vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, i) => responder(String(u), i))
    const tela = await montar()
    await tela.findAll('.abas button')[2]!.trigger('click')
    const botao = tela.findAll('button').find((b) => b.text() === 'Desfazer')!
    await botao.trigger('click')
    expect(fetchFalso.mock.calls.some(([u]) => String(u).includes('/desfazer'))).toBe(false)
    expect(tela.text()).toContain('Confirmar: desfazer')
  })
})
