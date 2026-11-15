<script setup lang="ts">
import { ref } from 'vue'

/**
 * DS-04: ícone "i" à esquerda do título. A descrição aparece após 1,5 s com o mouse parado;
 * no celular, abre e fecha com um toque.
 */
defineProps<{ texto: string; direita?: boolean }>()
const aberto = ref(false)

function alternar() {
  if (window.matchMedia('(max-width: 760px)').matches) aberto.value = !aberto.value
}
</script>

<template>
  <i
    class="info"
    :class="{ direita, aberto }"
    role="button"
    tabindex="0"
    :aria-label="texto"
    @click.stop="alternar"
    @keydown.enter="aberto = !aberto"
    @blur="aberto = false"
    >i<span class="tip" role="tooltip">{{ texto }}</span></i
  >
</template>

<style scoped>
.info {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.28);
  color: rgba(255, 255, 255, 0.5);
  font-size: 9px;
  font-weight: 700;
  font-style: normal;
  margin-right: 7px;
  cursor: help;
  vertical-align: 1px;
  flex: none;
  letter-spacing: 0;
  text-transform: none;
}
.info:hover {
  border-color: rgba(255, 255, 255, 0.6);
  color: var(--text);
}
.tip {
  position: absolute;
  top: 22px;
  left: -4px;
  z-index: 20;
  width: 260px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--elev);
  border: 1px solid var(--faint);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.45;
  color: var(--text);
  text-align: left;
  white-space: normal;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition:
    opacity 0.15s 0s,
    transform 0.15s 0s,
    visibility 0s 0.15s;
}
.info:hover .tip,
.info:focus-visible .tip,
.info.aberto .tip {
  opacity: 1;
  visibility: visible;
  transform: none;
}
.info:hover .tip {
  transition:
    opacity 0.15s 1.5s,
    transform 0.15s 1.5s,
    visibility 0s 1.5s;
}
.direita .tip {
  left: auto;
  right: -10px;
}
@media (max-width: 760px) {
  .tip {
    position: fixed;
    left: 16px;
    right: 16px;
    top: auto;
    bottom: 92px;
    width: auto;
    z-index: 50;
  }
  .info:hover .tip {
    transition: none;
  }
  .info:not(.aberto):hover .tip {
    opacity: 0;
    visibility: hidden;
  }
}
</style>
