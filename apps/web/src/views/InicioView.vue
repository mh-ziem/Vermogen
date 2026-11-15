<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { chamar } from '@/api/http'
import { useSessao } from '@/stores/sessao'

const sessao = useSessao()
const router = useRouter()
const versao = ref('')

onMounted(async () => {
  try {
    versao.value = (await chamar<{ versao: string }>('GET', '/health')).versao
  } catch {
    versao.value = ''
  }
})

async function sair() {
  await sessao.sair()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <div class="shell">
    <aside>
      <div class="brand"><i aria-hidden="true"></i>Vermögen</div>
      <a class="on" aria-current="page">Início</a>
      <div class="sp"></div>
      <button type="button" @click="sair">Sair</button>
    </aside>
    <main>
      <div class="topbar"><b>Início</b></div>
      <section class="card">
        <h2>Esqueleto do app</h2>
        <p>Login e acesso funcionando. As telas do protótipo entram nas próximas entregas.</p>
        <p v-if="versao" class="versao num">versão {{ versao }}</p>
      </section>
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
  font-size: 14px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
aside a.on,
aside button:hover {
  background: var(--card);
  color: var(--text);
}
.sp {
  flex: 1;
}
main {
  padding: 0 32px 40px;
  min-width: 0;
}
.topbar {
  padding: 16px 0;
  border-bottom: 1px solid var(--faint);
  margin-bottom: 24px;
  font-size: 20px;
}
h2 {
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  letter-spacing: 0.02em;
  margin-bottom: 14px;
}
p {
  font-size: 14px;
  line-height: 1.5;
}
.versao {
  margin-top: 10px;
  font-size: 12px;
  color: var(--muted);
}

/* DS-10: até 760 px, o menu lateral vira barra inferior. */
@media (max-width: 760px) {
  .shell {
    display: block;
  }
  aside {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 30;
    flex-direction: row;
    justify-content: space-around;
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
    padding: 12px 0;
    margin-bottom: 16px;
    font-size: 18px;
  }
}
</style>
