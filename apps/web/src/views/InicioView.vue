<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { chamar } from '@/api/http'
import type { Ciclo } from '@/api/tipos'
import AppShell from '@/components/AppShell.vue'
import { ciclo as nomeDoCiclo, data } from '@/formato'

const versao = ref('')
const ciclo = ref<Ciclo | null>(null)

onMounted(async () => {
  const [saude, atual] = await Promise.allSettled([
    chamar<{ versao: string }>('GET', '/health'),
    chamar<Ciclo>('GET', '/ciclos/atual'),
  ])
  if (saude.status === 'fulfilled') versao.value = saude.value.versao
  if (atual.status === 'fulfilled') ciclo.value = atual.value
})
</script>

<template>
  <AppShell
    :titulo="ciclo ? `Ciclo ${nomeDoCiclo(ciclo.id)}` : 'Início'"
    :subtitulo="ciclo ? `${data(ciclo.inicio, true)} – ${data(ciclo.fim, true)}` : ''"
  >
    <section class="card">
      <h2>Em construção</h2>
      <p>Cadastros e ciclos já funcionam. A projeção e os indicadores do protótipo entram na entrega de 29/12.</p>
      <p v-if="versao" class="versao num">versão {{ versao }}</p>
    </section>
  </AppShell>
</template>

<style scoped>
p {
  font-size: 14px;
  line-height: 1.5;
}
.versao {
  margin-top: 10px;
  font-size: 12px;
  color: var(--muted);
}
</style>
