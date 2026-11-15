<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CicloProjetado } from '@/api/tipos'
import InfoIcone from '@/components/InfoIcone.vue'
import { reais } from '@/formato'
import { centavos, textoAbsoluto } from './formato'
import { BASE_DA_FIXA, comoSaida, ORIGEM_DO_ITEM, restoDasFaturas, STATUS_DA_FATURA } from './valores'

/** Como a receita do ciclo atual se divide entre os destinos; clique numa linha abre os itens (DS-07). */
const props = defineProps<{ ciclo: CicloProjetado }>()

type Chave = 'faturas' | 'dizimo' | 'fixas' | 'aporte' | 'resultado'

const aberta = ref<Chave | null>(null)
const faturaAberta = ref<string | null>(null)
const foco = ref<Chave | null>(null)

const receita = computed(() => centavos(props.ciclo.receita))
const resto = computed(() => restoDasFaturas(props.ciclo))
const saidas = computed(
  () =>
    centavos(props.ciclo.dizimo) + centavos(props.ciclo.totais.faturas) + centavos(props.ciclo.totais.fixas) + centavos(props.ciclo.aporte),
)

const linhas = computed(() => {
  const c = props.ciclo
  const base: { chave: Chave; rotulo: string; cor: string; valor: number }[] = [
    { chave: 'faturas', rotulo: 'Faturas', cor: 'var(--c-faturas)', valor: -centavos(c.totais.faturas) },
    { chave: 'dizimo', rotulo: 'Dízimo', cor: 'var(--c-dizimo)', valor: -centavos(c.dizimo) },
    { chave: 'fixas', rotulo: 'Fixas e intermitentes', cor: 'var(--c-fixas)', valor: -centavos(c.totais.fixas) },
    { chave: 'aporte', rotulo: 'Aporte', cor: 'var(--c-aporte)', valor: -centavos(c.aporte) },
    { chave: 'resultado', rotulo: 'Resultado líquido', cor: 'var(--c-result)', valor: centavos(c.resultadoLiquido) },
  ]
  return base.map((l) => ({
    ...l,
    texto: l.valor < 0 ? `-${reais(textoAbsoluto(l.valor))}` : reais(textoAbsoluto(l.valor)),
    pct: receita.value > 0 ? `${Math.round((l.valor / receita.value) * 100)}%` : '—',
  }))
})

/** Barra empilhada: só os destinos positivos (um resultado negativo não ocupa espaço). */
const segmentos = computed(() => {
  const positivos = linhas.value.filter((l) => l.valor > 0)
  const soma = positivos.reduce((s, l) => s + l.valor, 0)
  return positivos.map((l) => ({ ...l, largura: soma > 0 ? (l.valor / soma) * 100 : 0 }))
})

function alternar(chave: Chave) {
  aberta.value = aberta.value === chave ? null : chave
  faturaAberta.value = null
}

function alternarFatura(id: string) {
  faturaAberta.value = faturaAberta.value === id ? null : id
}
</script>

<template>
  <section class="card distribuicao">
    <h2>
      <span
        ><InfoIcone
          texto="Como a receita do ciclo atual se divide entre os destinos. O resultado líquido é o que sobra depois de todos os outros. Clique numa linha para ver os itens."
        />Distribuição de capital</span
      >
      <span class="grow"></span>
      <span class="num total">{{ reais(ciclo.receita) }}</span>
    </h2>
    <div class="stack" :class="{ focus: foco !== null }">
      <span
        v-for="s in segmentos"
        :key="s.chave"
        :class="{ sel: foco === s.chave }"
        :style="{ width: `${s.largura}%`, background: s.cor }"
        :title="`${s.rotulo} · ${s.pct}`"
        @mouseenter="foco = s.chave"
        @mouseleave="foco = null"
        @click="alternar(s.chave)"
      ></span>
    </div>
    <table>
      <tbody>
        <template v-for="l in linhas" :key="l.chave">
          <tr
            class="linha"
            :class="{ hi: l.chave === 'resultado', aberta: aberta === l.chave }"
            :data-chave="l.chave"
            tabindex="0"
            :aria-expanded="aberta === l.chave"
            @click="alternar(l.chave)"
            @keydown.enter.prevent="alternar(l.chave)"
            @keydown.space.prevent="alternar(l.chave)"
            @mouseenter="foco = l.chave"
            @mouseleave="foco = null"
          >
            <td><span class="dot" :style="{ background: l.cor }"></span>{{ l.rotulo }}</td>
            <td class="p num">{{ l.pct }}</td>
            <td class="r num" :class="{ neg: l.valor < 0 }">{{ l.texto }}</td>
          </tr>
          <tr v-if="aberta === l.chave" class="detalhe">
            <td colspan="3">
              <ul v-if="l.chave === 'faturas'" class="itens">
                <li v-if="ciclo.faturas.length === 0 && resto === 0" class="vazio">Nenhuma fatura neste ciclo.</li>
                <li v-for="f in ciclo.faturas" :key="f.conta.id" class="fatura" :style="{ '--bk': f.conta.cor }">
                  <button type="button" class="item" :aria-expanded="faturaAberta === f.conta.id" @click="alternarFatura(f.conta.id)">
                    <span class="desc">Fatura {{ f.conta.instituicao }} <span class="sub">{{ f.conta.nome }}</span></span>
                    <span class="st" :class="f.status">{{ STATUS_DA_FATURA[f.status] }}</span>
                    <span class="v num" :class="{ pos: comoSaida(f.valor).entra }">{{ comoSaida(f.valor).texto }}</span>
                  </button>
                  <ul v-if="faturaAberta === f.conta.id" class="subitens">
                    <li v-if="f.itens.length === 0" class="vazio">Sem itens.</li>
                    <li v-for="(it, n) in f.itens" :key="n" class="item">
                      <span class="desc">{{ it.descricao }}</span>
                      <span class="origem">{{ ORIGEM_DO_ITEM[it.origem] }}</span>
                      <span class="v num" :class="{ pos: comoSaida(it.valor).entra }">{{ comoSaida(it.valor).texto }}</span>
                    </li>
                  </ul>
                </li>
                <li v-if="resto !== 0" class="item">
                  <span class="desc">Flexíveis nos cartões</span>
                  <span class="origem">estimativa</span>
                  <span class="v num">{{ comoSaida(`${resto < 0 ? '-' : ''}${textoAbsoluto(resto)}`).texto }}</span>
                </li>
              </ul>
              <ul v-else-if="l.chave === 'fixas'" class="itens">
                <li v-if="ciclo.fixas.length === 0" class="vazio">Nenhuma fixa neste ciclo.</li>
                <li v-for="(fx, n) in ciclo.fixas" :key="n" class="item">
                  <span class="desc">{{ fx.descricao }}</span>
                  <span class="origem">{{ BASE_DA_FIXA[fx.base] }}</span>
                  <span class="v num" :class="{ pos: comoSaida(fx.valor).entra }">{{ comoSaida(fx.valor).texto }}</span>
                </li>
              </ul>
              <ul v-else-if="l.chave === 'dizimo'" class="itens">
                <li class="item">
                  <span class="desc">Dízimo do ciclo</span>
                  <span class="v num">{{ comoSaida(ciclo.dizimo).texto }}</span>
                </li>
              </ul>
              <ul v-else-if="l.chave === 'aporte'" class="itens">
                <li class="item">
                  <span class="desc">Aporte do ciclo</span>
                  <span class="origem num">{{ ciclo.aportePercentual }}%</span>
                  <span class="v num">{{ comoSaida(ciclo.aporte).texto }}</span>
                </li>
              </ul>
              <ul v-else class="itens">
                <li class="item">
                  <span class="desc">Receita</span>
                  <span class="v num pos">{{ reais(ciclo.receita) }}</span>
                </li>
                <li class="item">
                  <span class="desc">Saídas previstas</span>
                  <span class="v num">{{ reais(textoAbsoluto(saidas)) }}</span>
                </li>
              </ul>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.grow {
  flex: 1;
}
.total {
  color: var(--text);
}
.stack {
  display: flex;
  height: 14px;
  overflow: hidden;
  gap: 2px;
  margin: 6px 0 16px;
}
.stack span {
  display: block;
  height: 100%;
  cursor: pointer;
  transition: opacity 0.2s;
}
.stack.focus span {
  opacity: 0.28;
}
.stack.focus span.sel {
  opacity: 1;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
td {
  padding: 9px 0;
  border-top: 1px solid var(--faint);
}
tr:first-child td {
  border-top: 0;
}
td.r {
  text-align: right;
  color: var(--muted);
}
td.p {
  text-align: right;
  width: 56px;
  color: var(--muted);
  font-size: 12px;
  padding-right: 4px;
}
tr.linha {
  cursor: pointer;
}
tr.linha:hover td,
tr.linha.aberta td {
  background: rgba(255, 255, 255, 0.02);
}
tr.hi td {
  color: var(--text);
  font-weight: 600;
}
td.neg,
tr.hi td.neg {
  color: var(--out);
}
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 10px;
  vertical-align: 1px;
}
tr.detalhe td {
  border-top: 0;
  padding: 0 0 10px;
}
.itens,
.subitens {
  list-style: none;
  background: var(--recess);
  border-radius: 10px;
  padding: 4px 12px;
}
.subitens {
  background: transparent;
  padding: 0 0 6px 12px;
}
.fatura {
  box-shadow: inset 3px 0 0 var(--bk);
  padding-left: 10px;
}
.item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 0;
  font-size: 13px;
  background: transparent;
  border: 0;
  text-align: left;
  color: var(--text);
}
button.item {
  cursor: pointer;
}
.itens > li + li,
.subitens > li + li {
  border-top: 1px solid var(--faint);
}
.desc {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sub,
.origem {
  font-size: 11px;
  color: var(--muted);
}
.v {
  text-align: right;
  color: var(--muted);
}
.v.pos {
  color: var(--in);
}
.st {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
}
.st.fechada {
  background: rgba(255, 255, 255, 0.07);
  color: var(--muted);
}
.st.a_importar {
  background: rgba(254, 206, 76, 0.13);
  color: var(--pending);
}
.st.projetada {
  background: rgba(91, 168, 255, 0.13);
  color: var(--info);
}
@media (max-width: 760px) {
  .sub,
  .origem,
  .st {
    display: none;
  }
}
</style>
