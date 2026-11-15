<script setup lang="ts">
import { computed } from 'vue'
import type { Abertura } from '@/api/tipos'
import InfoIcone from '@/components/InfoIcone.vue'

const props = defineProps<{ pendencias: Abertura['pendencias'] }>()

const contadores = computed(() => [
  { rotulo: 'Sem categoria', valor: props.pendencias.semCategoria },
  { rotulo: 'Possíveis duplicatas', valor: props.pendencias.possiveisDuplicatas },
  { rotulo: 'Lotes não conferidos', valor: props.pendencias.lotesNaoConferidos },
])
</script>

<template>
  <section class="card">
    <h2>
      <span>
        <InfoIcone
          texto="Itens que as regras não conseguiram resolver sozinhas. A resolução fica na tela de transações, na aba Pendências, ou pode ser pedida ao Claude, que resolve pelo MCP. Nenhum bloqueia o congelamento, mas afetam as métricas dos objetivos."
        />Pendências
      </span>
    </h2>
    <div class="pgrid">
      <div v-for="c in contadores" :key="c.rotulo" class="pk">
        <div class="l">{{ c.rotulo }}</div>
        <div class="v num" :class="c.valor ? 'pend' : 'pos'">{{ c.valor }}</div>
      </div>
    </div>
    <div class="acoes">
      <RouterLink class="btn primario" :to="{ name: 'transacoes', query: { aba: 'pendencias' } }">Resolver</RouterLink>
      <span class="m">ou peça ao Claude (MCP)</span>
    </div>
  </section>
</template>

<style scoped src="../projecao/comum.css"></style>
<style scoped>
.pgrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}
.pk {
  background: var(--recess);
  border-radius: 12px;
  padding: 14px;
}
.pk .l {
  font-size: 12px;
  color: var(--muted);
}
.pk .v {
  font-size: 26px;
  font-weight: 700;
  margin-top: 6px;
}
.acoes {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 13px;
}
.acoes .btn {
  text-decoration: none;
}
@media (max-width: 760px) {
  .pgrid {
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
}
</style>
