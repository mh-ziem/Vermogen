<script setup lang="ts">
import { computed } from 'vue'
import type { CicloProjetado } from '@/api/tipos'
import InfoIcone from '@/components/InfoIcone.vue'
import { data } from '@/formato'
import { textoAbsoluto } from './formato'
import { comoSaida, restoDasFaturas, STATUS_DA_FATURA } from './valores'

/** Faturas (com a cor da instituição na lateral, DS-06) e fixas do ciclo atual. */
const props = defineProps<{ ciclo: CicloProjetado }>()

const faturas = computed(() =>
  [...props.ciclo.faturas].sort((a, b) => a.vencimento.localeCompare(b.vencimento)),
)
const resto = computed(() => restoDasFaturas(props.ciclo))
</script>

<template>
  <section class="card saidas">
    <h2>
      <span
        ><InfoIcone
          texto="Pagamentos dentro do ciclo atual. Fechada: valor definitivo. A importar: já fechou no banco, mas o documento ainda não foi lançado (estimativa). Projetada: estimativa."
        />Saídas do ciclo</span
      >
      <span class="grow"></span>
      <RouterLink :to="{ name: 'projecao' }" class="ver">ver todas</RouterLink>
    </h2>
    <p v-if="faturas.length === 0 && ciclo.fixas.length === 0" class="vazio">Nenhuma saída prevista neste ciclo.</p>
    <table v-else>
      <tbody>
        <tr v-for="f in faturas" :key="f.conta.id" class="fatura" :style="{ '--bk': f.conta.cor }">
          <td class="desc">
            Fatura {{ f.conta.instituicao }}<span class="sub"> · {{ f.conta.nome }}</span
            ><span class="st" :class="f.status">{{ STATUS_DA_FATURA[f.status] }}</span>
          </td>
          <td class="dt num">{{ data(f.vencimento, true) }}</td>
          <td class="r num" :class="{ pos: comoSaida(f.valor).entra }">{{ comoSaida(f.valor).texto }}</td>
        </tr>
        <tr v-if="resto !== 0" class="fatura">
          <td class="desc">Flexíveis nos cartões<span class="st projetada">projetada</span></td>
          <td class="dt"></td>
          <td class="r num">{{ comoSaida(`${resto < 0 ? '-' : ''}${textoAbsoluto(resto)}`).texto }}</td>
        </tr>
        <tr v-for="(fx, n) in ciclo.fixas" :key="`fx${n}`" class="fixa">
          <td class="desc">
            {{ fx.descricao
            }}<span v-if="fx.base === 'realizado'" class="st fechada">realizada</span
            ><span v-else class="st projetada">projetada</span>
          </td>
          <td class="dt"></td>
          <td class="r num" :class="{ pos: comoSaida(fx.valor).entra }">{{ comoSaida(fx.valor).texto }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.grow {
  flex: 1;
}
.ver {
  color: var(--accent);
  text-decoration: none;
  font-weight: 500;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
td {
  padding: 10px 0;
  border-top: 1px solid var(--faint);
}
tr:first-child td {
  border-top: 0;
}
td.desc {
  padding-left: 14px;
}
tr.fatura td.desc {
  box-shadow: inset 3px 0 0 var(--bk, transparent);
}
tr.fixa td.desc {
  box-shadow: inset 3px 0 0 var(--faint);
}
.sub {
  font-size: 12px;
  color: var(--muted);
}
td.dt {
  color: var(--muted);
  font-size: 12px;
  text-align: right;
  width: 56px;
  padding-right: 12px;
}
td.r {
  text-align: right;
  color: var(--muted);
  white-space: nowrap;
}
td.r.pos {
  color: var(--in);
}
.st {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  margin-left: 8px;
  white-space: nowrap;
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
/* DS-10: no celular, somem a data, o nome do cartão e o status. */
@media (max-width: 760px) {
  td.dt,
  .sub,
  .st {
    display: none;
  }
}
</style>
