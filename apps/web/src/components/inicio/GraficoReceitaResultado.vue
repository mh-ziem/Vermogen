<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { CicloProjetado } from '@/api/tipos'
import InfoIcone from '@/components/InfoIcone.vue'
import { ciclo as nomeDoCiclo, reais } from '@/formato'
import { centavos, inteiro, mesCurto, passoRedondo, percentual, rotuloDoEixo } from './formato'

/** Receita (linha) × resultado líquido (barras), em SVG próprio (DM-01). Barras retas (DS-02). */
const props = defineProps<{ ciclos: CicloProjetado[] }>()

const celular = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  && window.matchMedia('(max-width: 760px)').matches
/** DS-10: no celular, o gráfico começa com 6 ciclos. */
const quantos = ref<6 | 12>(celular ? 6 : 12)
const ativo = ref<number | null>(null)

const caixa = ref<HTMLDivElement | null>(null)
const largura = ref(720)
const altura = ref(celular ? 220 : 280)
let observador: ResizeObserver | null = null

function medir() {
  const el = caixa.value
  if (!el) return
  if (el.clientWidth > 0) largura.value = el.clientWidth
  if (el.clientHeight > 0) altura.value = el.clientHeight
}

onMounted(() => {
  medir()
  if (typeof ResizeObserver !== 'undefined' && caixa.value) {
    observador = new ResizeObserver(medir)
    observador.observe(caixa.value)
  }
})
onBeforeUnmount(() => observador?.disconnect())

const M = { esq: 58, dir: 12, topo: 18, base: 28 }

const pontos = computed(() =>
  props.ciclos.slice(0, quantos.value).map((c, i) => {
    const receita = centavos(c.receita) / 100
    const resultado = centavos(c.resultadoLiquido) / 100
    return {
      id: c.ciclo.id,
      atual: i === 0,
      receita,
      resultado,
      textoReceita: c.receita,
      textoResultado: c.resultadoLiquido,
      margem: receita > 0 ? percentual((resultado / receita) * 100) : '—',
    }
  }),
)

const escala = computed(() => {
  const valores = pontos.value.flatMap((p) => [p.receita, p.resultado])
  const max = Math.max(0, ...valores)
  const min = Math.min(0, ...valores)
  const passo = passoRedondo((max - min) / 3 || 1000)
  const topo = Math.ceil(max / passo) * passo || passo
  const fundo = Math.floor(min / passo) * passo
  const marcas: number[] = []
  for (let v = fundo; v <= topo + passo / 2; v += passo) marcas.push(v)
  return { topo, fundo, marcas }
})

const area = computed(() => ({
  w: Math.max(40, largura.value - M.esq - M.dir),
  h: Math.max(40, altura.value - M.topo - M.base),
}))

function x(i: number) {
  return M.esq + (area.value.w * (i + 0.5)) / pontos.value.length
}
function y(v: number) {
  const { topo, fundo } = escala.value
  return M.topo + area.value.h * (1 - (v - fundo) / (topo - fundo))
}

const larguraDaBarra = computed(() => Math.min(38, (area.value.w / Math.max(1, pontos.value.length)) * 0.5))
const fatia = computed(() => area.value.w / Math.max(1, pontos.value.length))
const linha = computed(() => pontos.value.map((p, i) => `${x(i)},${y(p.receita)}`).join(' '))

const dica = computed(() => {
  if (ativo.value === null) return null
  const p = pontos.value[ativo.value]
  if (!p) return null
  return {
    p,
    esq: Math.max(0, Math.min(x(ativo.value) + 14, largura.value - 190)),
    topo: Math.min(y(p.receita) + 10, altura.value - 110),
  }
})

const descricao = computed(() =>
  pontos.value
    .map((p) => `${nomeDoCiclo(p.id)}: receita ${inteiro(p.receita)}, resultado ${inteiro(p.resultado)}`)
    .join('; '),
)
</script>

<template>
  <section class="card grafico">
    <h2>
      <span
        ><InfoIcone
          texto="Linha: receita por ciclo. Barras: resultado líquido por ciclo. Os ciclos futuros são estimativas feitas a partir dos compromissos, parcelas e orçamentos registrados."
        />Receita × resultado líquido</span
      >
      <span class="lg"><i class="ln"></i>Receita</span>
      <span class="lg"><i class="br"></i>Resultado líquido</span>
      <span class="grow"></span>
      <div class="seg" role="group" aria-label="Quantidade de ciclos">
        <button v-for="n in [6, 12] as const" :key="n" type="button" :class="{ on: quantos === n }" :aria-pressed="quantos === n" @click="quantos = n">
          {{ n }} ciclos
        </button>
      </div>
    </h2>
    <div ref="caixa" class="chartwrap">
      <svg :viewBox="`0 0 ${largura} ${altura}`" role="img" :aria-label="descricao">
        <g v-for="m in escala.marcas" :key="`m${m}`">
          <line :x1="M.esq" :x2="largura - M.dir" :y1="y(m)" :y2="y(m)" :stroke="m === 0 ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.07)'" />
          <text :x="M.esq - 10" :y="y(m) + 4" text-anchor="end" font-size="11" fill="rgba(255,255,255,.45)">{{ rotuloDoEixo(m) }}</text>
        </g>
        <g v-for="(p, i) in pontos" :key="p.id">
          <rect
            class="barra"
            :class="{ neg: p.resultado < 0 }"
            :x="x(i) - larguraDaBarra / 2"
            :y="Math.min(y(p.resultado), y(0))"
            :width="larguraDaBarra"
            :height="Math.abs(y(0) - y(p.resultado))"
            :fill-opacity="ativo === null ? (p.atual ? 1 : 0.42) : ativo === i ? 1 : 0.3"
          />
          <text
            class="etiqueta num"
            :x="x(i)"
            :y="p.resultado < 0 ? y(p.resultado) + 12 : y(p.resultado) - 5"
            text-anchor="middle"
            font-size="10"
          >{{ inteiro(p.resultado) }}</text>
          <text :x="x(i)" :y="altura - 8" text-anchor="middle" font-size="11" :fill="p.atual ? '#fff' : 'rgba(255,255,255,.5)'">{{ mesCurto(p.id) }}</text>
        </g>
        <polyline :points="linha" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="2" stroke-linejoin="round" />
        <circle
          v-for="(p, i) in pontos"
          :key="`c${p.id}`"
          :cx="x(i)"
          :cy="y(p.receita)"
          :r="p.atual ? 4.5 : 3"
          :fill="p.atual ? '#fff' : '#001533'"
          stroke="#fff"
          stroke-width="1.5"
        />
        <rect
          v-for="(p, i) in pontos"
          :key="`h${p.id}`"
          class="alvo"
          :x="M.esq + fatia * i"
          :y="M.topo"
          :width="fatia"
          :height="area.h"
          fill="transparent"
          tabindex="0"
          :aria-label="`Ciclo ${nomeDoCiclo(p.id)}`"
          @mouseenter="ativo = i"
          @mouseleave="ativo = null"
          @focus="ativo = i"
          @blur="ativo = null"
        />
      </svg>
      <div v-if="dica" class="tt" role="tooltip" :style="{ left: `${dica.esq}px`, top: `${dica.topo}px` }">
        <div class="h">Ciclo {{ nomeDoCiclo(dica.p.id) }}{{ dica.p.atual ? ' · atual' : '' }}</div>
        <div class="r">Receita <b class="num">{{ reais(dica.p.textoReceita) }}</b></div>
        <div class="r">Resultado líquido <b class="num">{{ reais(dica.p.textoResultado) }}</b></div>
        <div class="r">Margem <b class="num">{{ dica.p.margem }}</b></div>
      </div>
    </div>
  </section>
</template>

<style scoped>
h2 {
  gap: 18px;
}
.grow {
  flex: 1;
}
.lg {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}
.lg i {
  display: inline-block;
}
.lg .ln {
  width: 16px;
  height: 2px;
  background: #fff;
}
.lg .br {
  width: 10px;
  height: 10px;
  background: var(--c-result);
}
.seg {
  display: inline-flex;
  background: var(--recess);
  border-radius: 999px;
  padding: 3px;
}
.seg button {
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  padding: 5px 11px;
  border-radius: 999px;
  cursor: pointer;
}
.seg button.on {
  background: var(--elev);
  color: var(--text);
}
.chartwrap {
  position: relative;
  height: 280px;
}
.chartwrap svg {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}
.barra {
  fill: var(--c-result);
  transition: fill-opacity 0.15s;
}
.barra.neg {
  fill: var(--out);
}
.etiqueta {
  fill: rgba(255, 255, 255, 0.6);
  pointer-events: none;
}
.alvo {
  outline: none;
  cursor: default;
}
.tt {
  position: absolute;
  pointer-events: none;
  background: var(--elev);
  border: 1px solid var(--faint);
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 12px;
  min-width: 170px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}
.tt .h {
  font-weight: 650;
  font-size: 13px;
  margin-bottom: 6px;
}
.tt .r {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  color: var(--muted);
  margin-top: 3px;
}
.tt .r b {
  color: var(--text);
  font-weight: 600;
}
@media (max-width: 760px) {
  h2 {
    flex-wrap: wrap;
    gap: 8px 14px;
  }
  .chartwrap {
    height: 220px;
  }
}
</style>
