<script setup lang="ts">
import { computed } from 'vue'
import type { Categoria } from '@/api/tipos'

/** Lista de categorias agrupada por categoria de primeiro nível. */
const props = defineProps<{ categorias: Categoria[]; vazio?: string }>()
const modelo = defineModel<string>({ default: '' })

const grupos = computed(() => {
  const raizes = props.categorias.filter((c) => !c.paiId && c.ativa)
  return raizes.map((r) => ({ raiz: r, filhas: props.categorias.filter((c) => c.paiId === r.id && c.ativa) }))
})
</script>

<template>
  <select v-model="modelo">
    <option value="">{{ vazio ?? 'Sem categoria' }}</option>
    <template v-for="g in grupos" :key="g.raiz.id">
      <option v-if="g.filhas.length === 0" :value="g.raiz.id">{{ g.raiz.nome }}</option>
      <optgroup v-else :label="g.raiz.nome">
        <option :value="g.raiz.id">{{ g.raiz.nome }} (geral)</option>
        <option v-for="f in g.filhas" :key="f.id" :value="f.id">{{ f.nome }}</option>
      </optgroup>
    </template>
  </select>
</template>
