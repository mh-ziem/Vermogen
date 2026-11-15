import { defineStore } from 'pinia'
import { ref } from 'vue'
import { chamar, ErroDeApi } from '@/api/http'

interface DadosDaSessao {
  usuario: string
  expiraEm: string
}

export const useSessao = defineStore('sessao', () => {
  /** null = ainda não consultou o servidor. */
  const autenticado = ref<boolean | null>(null)
  const usuario = ref<string | null>(null)

  function aplicar(dados: DadosDaSessao | null) {
    autenticado.value = dados !== null
    usuario.value = dados?.usuario ?? null
  }

  /** Pergunta ao servidor se o cookie deste dispositivo ainda vale. */
  async function verificar(): Promise<boolean> {
    try {
      aplicar(await chamar<DadosDaSessao>('GET', '/auth/sessao'))
    } catch (erro) {
      // Só o 401 significa "sem sessão"; falha de rede não deve derrubar quem está logado.
      if (erro instanceof ErroDeApi && erro.status === 401) aplicar(null)
      else if (autenticado.value === null) throw erro
    }
    return autenticado.value === true
  }

  async function entrar(senha: string): Promise<void> {
    aplicar(await chamar<DadosDaSessao>('POST', '/auth/login', { senha }))
  }

  async function sair(): Promise<void> {
    try {
      await chamar<void>('POST', '/auth/logout')
    } finally {
      aplicar(null)
    }
  }

  return { autenticado, usuario, verificar, entrar, sair }
})
