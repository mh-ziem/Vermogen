// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import LoginView from './LoginView.vue'

function resposta(status: number, corpo: unknown, cabecalhos: Record<string, string> = {}) {
  return new Response(JSON.stringify(corpo), { status, headers: cabecalhos })
}

async function montar() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<p>inicio</p>' } },
      { path: '/login', component: LoginView },
    ],
  })
  await router.push('/login')
  const tela = mount(LoginView, { global: { plugins: [router] } })
  return { tela, router }
}

describe('tela de login', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('envia a senha e vai para o início', async () => {
    const fetchFalso = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(resposta(200, { usuario: 'matheus', expiraEm: '2026-12-14T00:00:00Z' }))
    const { tela, router } = await montar()

    await tela.find('input[type=password]').setValue('minha-senha-longa')
    await tela.find('form').trigger('submit')
    await flushPromises()

    expect(fetchFalso).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ senha: 'minha-senha-longa' }) }),
    )
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('senha errada: mostra o erro, limpa o campo e continua no login', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(resposta(401, { message: 'Senha incorreta' }))
    const { tela, router } = await montar()

    await tela.find('input[type=password]').setValue('errada')
    await tela.find('form').trigger('submit')
    await flushPromises()

    expect(tela.find('[role=alert]').text()).toBe('Senha incorreta.')
    expect((tela.find('input[type=password]').element as HTMLInputElement).value).toBe('')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('bloqueio por tentativas: informa o tempo de espera', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(resposta(429, { message: 'x' }, { 'Retry-After': '840' }))
    const { tela } = await montar()

    await tela.find('input[type=password]').setValue('qualquer')
    await tela.find('form').trigger('submit')
    await flushPromises()

    expect(tela.find('[role=alert]').text()).toBe('Muitas tentativas. Tente de novo em 14 min.')
  })
})
