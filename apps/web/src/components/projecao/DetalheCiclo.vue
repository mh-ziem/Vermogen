<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CicloProjetado, FaturaProjetada } from '@/api/tipos'
import InfoIcone from '@/components/InfoIcone.vue'
import ListaDeItens from '@/components/projecao/ListaDeItens.vue'
import { BASES_DA_FIXA, cicloCurto, ORIGENS_DO_ITEM, STATUS_DA_FATURA } from '@/components/projecao/formato'
import { data, reais } from '@/formato'

/** Detalhe de um ciclo da projeção (UC-04, DS-07): faturas, flexíveis do ciclo anterior e fixas. */
const props = defineProps<{ ciclo: CicloProjetado }>()

const abertas = ref(new Set<string>())
function alternar(id: string) {
  const s = new Set(abertas.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  abertas.value = s
}

function itensDa(f: FaturaProjetada) {
  return f.itens.map((it) => ({
    descricao: it.descricao,
    valor: it.valor,
    nota: it.origem === 'realizado' ? undefined : ORIGENS_DO_ITEM[it.origem],
  }))
}

const flexiveis = computed(() => props.ciclo.flexiveisNosCartoes)
const temFlexiveis = computed(() => Number(flexiveis.value.valor) !== 0)
</script>

<template>
  <div class="detalhe">
    <div class="bloco">
      <h3>
        <InfoIcone
          texto="Faturas dos cartões pagas neste ciclo. Fechada: já fechou e foi importada (valor real). A importar: já fechou, mas o documento não chegou (estimativa). Projetada: ainda aberta. Clique para ver os itens."
        />Faturas<span class="grow"></span><span class="num">{{ reais(ciclo.totais.faturas) }}</span>
      </h3>
      <p v-if="ciclo.faturas.length === 0" class="vazio">Nenhuma fatura.</p>
      <table v-else>
        <tbody>
          <template v-for="f in ciclo.faturas" :key="f.conta.id">
            <tr
              class="bk click"
              :class="{ open: abertas.has(f.conta.id) }"
              :style="{ '--bk': f.conta.cor }"
              tabindex="0"
              :aria-expanded="abertas.has(f.conta.id)"
              @click="alternar(f.conta.id)"
              @keydown.enter="alternar(f.conta.id)"
            >
              <td>{{ f.conta.instituicao }} · {{ f.conta.nome }}</td>
              <td class="m num sec">
                vence {{ data(f.vencimento, true) }}<template v-if="f.status !== 'fechada' && Number(f.realizado) !== 0"> · gravado {{ reais(f.realizado) }}</template>
              </td>
              <td>
                <span class="chip" :class="{ warn: f.status === 'a_importar', ok: f.status === 'fechada' }">{{ STATUS_DA_FATURA[f.status] }}</span>
              </td>
              <td class="r num">{{ reais(f.valor) }}</td>
            </tr>
            <tr v-if="abertas.has(f.conta.id)" class="det">
              <td colspan="4">
                <ListaDeItens :cor="f.conta.cor" :itens="itensDa(f)" />
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <div v-if="temFlexiveis" class="bloco">
      <h3>
        <InfoIcone
          texto="Orçamento de flexíveis do ciclo anterior ainda não gasto: entra nas faturas deste ciclo como estimativa (RN-11). Já está somado no total das faturas."
        />Flexíveis do ciclo anterior<span class="grow"></span><span class="num">{{ reais(flexiveis.valor) }}</span>
      </h3>
      <ListaDeItens
        :itens="[
          { descricao: 'Orçamento do ciclo anterior', valor: flexiveis.orcamentoDoCicloAnterior },
          { descricao: 'Gasto no ciclo anterior', valor: flexiveis.gastoNoCicloAnterior },
        ]"
      />
    </div>

    <div class="bloco">
      <h3>
        <InfoIcone
          texto="Contas fora do cartão. Intermitentes usam o maior valor dos últimos 3 ciclos, a menos que você fixe um valor em Configurações (RN-10). Realizado: o gravado no ciclo já passou da estimativa."
        />Fixas e intermitentes<span class="grow"></span><span class="num">{{ reais(ciclo.totais.fixas) }}</span>
      </h3>
      <p v-if="ciclo.fixas.length === 0" class="vazio">Nenhuma fixa.</p>
      <table v-else>
        <tbody>
          <tr v-for="(f, i) in ciclo.fixas" :key="f.categoriaId ?? i">
            <td>{{ f.descricao }}</td>
            <td><span class="chip">{{ BASES_DA_FIXA[f.base] }}</span></td>
            <td class="m num sec hist">
              <span v-for="h in f.historico" :key="h.ciclo">{{ cicloCurto(h.ciclo) }} {{ reais(h.valor) }}</span>
            </td>
            <td class="r num">{{ reais(f.valor) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped src="./comum.css"></style>
<style scoped>
.detalhe {
  background: var(--recess);
  padding: 6px 16px 10px;
  margin-bottom: 10px;
  display: grid;
  gap: 6px;
}
.bloco {
  padding-top: 8px;
}
h3 {
  display: flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  letter-spacing: 0.02em;
  padding: 6px 0;
}
h3 .num {
  color: var(--text);
}
table {
  font-size: 13px;
}
td {
  padding: 8px 10px 8px 0;
}
.hist span + span::before {
  content: ' · ';
}
@media (max-width: 760px) {
  .sec {
    display: none;
  }
}
</style>
