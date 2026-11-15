<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Abertura } from '@/api/tipos'
import InfoIcone from '@/components/InfoIcone.vue'
import { dataHora, percentual, VEREDITOS } from '@/components/projecao/formato'
import { ciclo as nomeDoCiclo, reais } from '@/formato'

const props = defineProps<{ abertura: Abertura; congelando?: boolean; erro?: string }>()
const emit = defineEmits<{ congelar: [] }>()

const aceitos = computed(() => props.abertura.entrada.filter((e) => e.status === 'aceito').length)
const esperadas = computed(() => props.abertura.entrada.length)
const lotesCompletos = computed(() => aceitos.value === esperadas.value)
const pendencias = computed(() => props.abertura.pendencias.total)
/** HU-17 CA1: congelar é permitido assim mesmo; só sinaliza. */
const incompleto = computed(() => !lotesCompletos.value || pendencias.value > 0)

const d = computed(() => props.abertura.distribuicao)
const aporteNaMeta = computed(
  () => Number(props.abertura.plano.aporte) + 0.005 >= (Math.abs(Number(d.value.receita)) * d.value.aportePercentual) / 100,
)
const veredito = computed(() => VEREDITOS[d.value.veredito])

// "Congelar de novo" pede um segundo clique (como o "Desfazer" das transações).
const confirmar = ref(false)
watch(
  () => props.abertura.congelamento,
  () => (confirmar.value = false),
)

function congelar() {
  if (props.abertura.congelamento && !confirmar.value) {
    confirmar.value = true
    return
  }
  confirmar.value = false
  emit('congelar')
}
</script>

<template>
  <section class="card">
    <h2>
      <span>
        <InfoIcone
          direita
          texto="Ao congelar, a projeção do ciclo é guardada com a data e a hora. Ela será comparada com o realizado no fim do ciclo, na próxima abertura. Pode congelar com lotes faltando ou pendências em aberto: fica marcada como incompleta. Congelar de novo substitui a anterior."
        />Confirmação
      </span>
    </h2>
    <table class="resumo">
      <tbody>
        <tr>
          <td>Lotes aceitos</td>
          <td class="r num">{{ aceitos }}/{{ esperadas }}</td>
          <td class="r">
            <span class="chip" :class="lotesCompletos ? 'ok' : 'warn'">{{ lotesCompletos ? 'Completo' : 'Incompleto' }}</span>
          </td>
        </tr>
        <tr>
          <td>Pendências em aberto</td>
          <td class="r num">{{ pendencias }}</td>
          <td class="r">
            <span class="chip" :class="pendencias ? 'warn' : 'ok'">{{ pendencias ? 'Seguem para o ciclo' : 'Nenhuma' }}</span>
          </td>
        </tr>
        <tr>
          <td>Aporte do ciclo</td>
          <td class="r num">{{ reais(abertura.plano.aporte) }}</td>
          <td class="r">
            <span class="chip num" :class="aporteNaMeta ? 'ok' : 'warn'">{{ percentual(abertura.plano.aporte, d.receita) }} do salário</span>
          </td>
        </tr>
        <tr>
          <td>Orçamento de flexíveis</td>
          <td class="r num">{{ reais(abertura.plano.orcamentoFlexiveis) }}</td>
          <td class="r"><span class="chip">Livre para gastar</span></td>
        </tr>
        <tr class="total">
          <td>Líquido projetado</td>
          <td class="r num" :class="Number(d.resultadoLiquido) < 0 ? 'neg' : ''">{{ reais(d.resultadoLiquido) }}</td>
          <td class="r"><span class="chip" :class="veredito.classe">{{ veredito.rotulo }}</span></td>
        </tr>
      </tbody>
    </table>

    <div v-if="abertura.congelamento" class="feito">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--in)" stroke-width="1.8" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="m7.5 12.5 3 3 6-6.5" />
      </svg>
      <div class="grande">Ciclo {{ nomeDoCiclo(abertura.ciclo.id) }} aberto</div>
      <div class="quando num">Projeção congelada em {{ dataHora(abertura.congelamento.congeladaEm) }}</div>
      <div class="congelado num">
        <span>Líquido congelado {{ reais(abertura.congelamento.resultadoLiquido) }}</span>
        <span v-if="abertura.congelamento.incompleta" class="chip warn">Incompleta</span>
      </div>
    </div>

    <div class="foot">
      <span v-if="!abertura.congelamento" class="chip" :class="incompleto ? 'warn' : 'ok'">{{ incompleto ? 'Incompleto' : 'Completo' }}</span>
      <span v-else></span>
      <button
        class="btn lg"
        :class="abertura.congelamento ? (confirmar ? 'perigo' : '') : 'primario'"
        :disabled="congelando"
        @click="congelar"
      >
        {{
          !abertura.congelamento
            ? 'Congelar projeção do ciclo'
            : confirmar
              ? 'Confirmar: substituir a projeção congelada'
              : 'Congelar de novo'
        }}
      </button>
    </div>
    <p v-if="erro" class="erro" role="alert">{{ erro }}</p>
  </section>
</template>

<style scoped src="../projecao/comum.css"></style>
<style scoped>
.resumo td {
  font-size: 13.5px;
}
tr.total td {
  font-weight: 700;
}
.foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  flex-wrap: wrap;
}
.btn.lg {
  padding: 12px 18px;
  font-size: 14px;
}
.btn.perigo {
  background: rgba(255, 107, 91, 0.18);
  color: var(--out);
}
.feito {
  text-align: center;
  padding: 26px 10px 6px;
}
.grande {
  font-size: 22px;
  font-weight: 700;
  margin: 10px 0 6px;
  color: var(--in);
}
.quando,
.congelado {
  color: var(--muted);
  font-size: 13px;
}
.congelado {
  margin-top: 6px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
}
.erro {
  margin-top: 12px;
}
</style>
