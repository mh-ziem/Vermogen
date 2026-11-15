<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useSessao } from '@/stores/sessao'

defineProps<{ titulo: string; subtitulo?: string }>()

const sessao = useSessao()
const router = useRouter()

/** Itens do menu já disponíveis (DM-03); os demais entram com as próximas entregas. */
const itens = [
  { nome: 'inicio', rotulo: 'Início' },
  { nome: 'abertura', rotulo: 'Abertura do ciclo', curto: 'Abertura' },
  { nome: 'projecao', rotulo: 'Projeção' },
  { nome: 'transacoes', rotulo: 'Transações' },
  // DS-10: a barra do celular tem 5 itens; Contas (cadastro raro) fica só no desktop.
  { nome: 'contas', rotulo: 'Contas', soDesktop: true },
  { nome: 'configuracoes', rotulo: 'Configurações', curto: 'Ajustes' },
]

async function sair() {
  await sessao.sair()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <div class="shell">
    <aside>
      <div class="brand"><i aria-hidden="true"></i>Vermögen</div>
      <RouterLink
        v-for="item in itens"
        :key="item.nome"
        :to="{ name: item.nome }"
        active-class="on"
        :class="{ 'so-desktop': item.soDesktop }"
      >
        <span class="longo">{{ item.rotulo }}</span><span class="curto">{{ item.curto ?? item.rotulo }}</span>
      </RouterLink>
      <div class="sp"></div>
      <button type="button" @click="sair">Sair</button>
    </aside>
    <main>
      <header class="topbar">
        <b>{{ titulo }}</b>
        <span v-if="subtitulo" class="num">{{ subtitulo }}</span>
        <div class="acoes"><slot name="acoes" /></div>
      </header>
      <slot />
    </main>
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: 232px 1fr;
  min-height: 100dvh;
}
aside {
  background: var(--recess);
  border-right: 1px solid var(--faint);
  padding: 22px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: sticky;
  top: 0;
  height: 100dvh;
}
.brand {
  font-weight: 700;
  font-size: 15px;
  padding: 4px 10px 22px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand i {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  background: linear-gradient(135deg, var(--accent), #00b8d9);
}
aside a,
aside button {
  color: var(--muted);
  text-decoration: none;
  font-size: 14px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
aside a:hover,
aside a.on,
aside button:hover {
  background: var(--card);
  color: var(--text);
}
.sp {
  flex: 1;
}
.curto {
  display: none;
}
main {
  padding: 0 32px 40px;
  min-width: 0;
}
.topbar {
  position: sticky;
  top: 0;
  z-index: 5;
  background: rgba(0, 8, 20, 0.86);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 16px 0;
  border-bottom: 1px solid var(--faint);
  margin-bottom: 24px;
}
.topbar b {
  font-size: 20px;
  font-weight: 650;
}
.topbar span {
  font-size: 13px;
  color: var(--muted);
}
.acoes {
  margin-left: auto;
  display: flex;
  gap: 8px;
  align-self: center;
}

/* DS-10: até 760 px, o menu lateral vira barra inferior. */
@media (max-width: 760px) {
  aside a.so-desktop,
  .longo {
    display: none;
  }
  .curto {
    display: inline;
  }
  .shell {
    display: block;
  }
  aside {
    position: fixed;
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    height: auto;
    z-index: 30;
    flex-direction: row;
    justify-content: space-around;
    gap: 0;
    padding: 6px 4px calc(6px + env(safe-area-inset-bottom));
    border-right: 0;
    border-top: 1px solid var(--faint);
    background: rgba(1, 13, 30, 0.96);
  }
  .brand,
  .sp {
    display: none;
  }
  aside a,
  aside button {
    flex: 1;
    text-align: center;
    font-size: 10.5px;
    padding: 8px 2px;
  }
  main {
    padding: 0 16px 96px;
  }
  .topbar {
    flex-wrap: wrap;
    gap: 4px 10px;
    padding: 12px 0;
    margin-bottom: 16px;
  }
  .topbar b {
    font-size: 18px;
  }
}
</style>
