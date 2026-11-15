<script setup lang="ts">
import { reais } from '@/formato'

/** DS-07: itens de uma linha de agregado, abertos por clique. */
defineProps<{
  itens: { descricao: string; valor: string; nota?: string }[]
  cor?: string
}>()
</script>

<template>
  <div class="det-box" :style="{ boxShadow: `inset 3px 0 0 ${cor ?? 'var(--faint)'}` }">
    <p v-if="itens.length === 0" class="it vazio-it">Sem itens</p>
    <div v-for="(it, i) in itens" :key="i" class="it">
      <b>{{ it.descricao }}<span v-if="it.nota" class="nota">{{ it.nota }}</span></b>
      <span class="num">{{ reais(it.valor) }}</span>
    </div>
  </div>
</template>

<style scoped>
.det-box {
  background: var(--recess);
  margin: 0 0 10px;
  padding: 4px 14px;
}
.it {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12.5px;
  padding: 7px 0;
  border-top: 1px solid var(--faint);
  color: var(--muted);
}
.it:first-child {
  border-top: 0;
}
.it b {
  color: var(--text);
  font-weight: 500;
  min-width: 0;
}
.nota {
  margin-left: 8px;
  font-size: 11px;
  font-weight: 400;
  color: var(--muted);
}
.vazio-it {
  font-style: normal;
}
</style>
