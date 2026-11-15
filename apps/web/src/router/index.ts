import { createRouter, createWebHistory } from 'vue-router'
import { useSessao } from '@/stores/sessao'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { publica: true } },
    { path: '/', name: 'inicio', component: () => import('@/views/InicioView.vue') },
    { path: '/:resto(.*)*', redirect: '/' },
  ],
})

/** Sem sessão válida, toda tela leva ao login; a proteção real dos dados é do servidor (401). */
router.beforeEach(async (para) => {
  const sessao = useSessao()
  if (sessao.autenticado === null) {
    try {
      await sessao.verificar()
    } catch {
      // Servidor fora do ar: a tela de login mostra o erro na tentativa de entrar.
    }
  }
  if (!para.meta.publica && !sessao.autenticado) {
    return { name: 'login', query: para.fullPath === '/' ? {} : { destino: para.fullPath } }
  }
  if (para.name === 'login' && sessao.autenticado) return { name: 'inicio' }
  return true
})

export default router
