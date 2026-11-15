<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { chamar, ErroDeApi } from '@/api/http'
import type { Conta, FaturaDaCompra, Finalidade, VigenciaDeFinalidade } from '@/api/tipos'
import InfoIcone from '@/components/InfoIcone.vue'
import { ciclo, data, desde, FINALIDADES, hoje } from '@/formato'

const props = defineProps<{ conta: Conta }>()
const emit = defineEmits<{ alterada: [] }>()

const nome = ref(props.conta.nome)
const ativa = ref(props.conta.ativa)
const diaFechamento = ref(props.conta.cartao?.diaFechamento ?? 1)
const diaVencimento = ref(props.conta.cartao?.diaVencimento ?? 1)
const historico = ref<VigenciaDeFinalidade[]>([])
const novaFinalidade = ref<Finalidade>('gasto')
const vigenteDe = ref(hoje())
const compra = ref(hoje())
const fatura = ref<FaturaDaCompra | null>(null)
const erro = ref('')

function falha(e: unknown) {
  erro.value = e instanceof ErroDeApi ? e.message : 'Não foi possível concluir'
}

async function carregarHistorico() {
  historico.value = await chamar<VigenciaDeFinalidade[]>('GET', `/contas/${props.conta.id}/finalidades`)
}

async function salvar() {
  erro.value = ''
  try {
    await chamar('PATCH', `/contas/${props.conta.id}`, {
      nome: nome.value,
      ativa: ativa.value,
      ...(props.conta.cartao ? { diaFechamento: diaFechamento.value, diaVencimento: diaVencimento.value } : {}),
    })
    emit('alterada')
  } catch (e) {
    falha(e)
  }
}

async function mudarFinalidade() {
  erro.value = ''
  try {
    historico.value = await chamar<VigenciaDeFinalidade[]>('POST', `/contas/${props.conta.id}/finalidades`, {
      finalidade: novaFinalidade.value,
      vigenteDe: vigenteDe.value,
    })
    emit('alterada')
  } catch (e) {
    falha(e)
  }
}

async function simular() {
  erro.value = ''
  try {
    fatura.value = await chamar<FaturaDaCompra>('GET', `/contas/${props.conta.id}/fatura?compra=${compra.value}`)
  } catch (e) {
    falha(e)
  }
}

onMounted(() => {
  void carregarHistorico().catch(falha)
  if (props.conta.cartao) void simular()
})
</script>

<template>
  <div class="detalhe">
    <form class="linha" @submit.prevent="salvar">
      <label class="campo nome">Nome<input v-model="nome" required maxlength="60" /></label>
      <template v-if="conta.cartao">
        <label class="campo dia">Fecha dia<input v-model.number="diaFechamento" type="number" min="1" max="31" /></label>
        <label class="campo dia">Vence dia<input v-model.number="diaVencimento" type="number" min="1" max="31" /></label>
      </template>
      <label class="check"><input v-model="ativa" type="checkbox" /> Ativa</label>
      <button class="btn primario">Salvar</button>
    </form>

    <section>
      <h3>
        <InfoIcone texto="Mudar a finalidade vale a partir da data escolhida. As datas anteriores continuam com a finalidade antiga (RN-14)." />
        Finalidade
      </h3>
      <ul class="historico">
        <li v-for="v in historico" :key="v.id" class="num">
          <b>{{ FINALIDADES[v.finalidade] }}</b>
          {{ v.vigenteAte ? `${desde(v.vigenteDe)} até ${data(v.vigenteAte)}` : desde(v.vigenteDe) }}
        </li>
      </ul>
      <form class="linha" @submit.prevent="mudarFinalidade">
        <label class="campo">
          Nova finalidade
          <select v-model="novaFinalidade">
            <option v-for="(rotulo, valor) in FINALIDADES" :key="valor" :value="valor">{{ rotulo }}</option>
          </select>
        </label>
        <label class="campo">A partir de<input v-model="vigenteDe" type="date" required /></label>
        <button class="btn">Mudar</button>
      </form>
    </section>

    <section v-if="conta.cartao">
      <h3>
        <InfoIcone texto="Em que fatura uma compra nessa data entra e em que ciclo ela é paga, pelas datas reais de fechamento e vencimento (RN-08, RN-09)." />
        Fatura de uma compra
      </h3>
      <form class="linha" @submit.prevent="simular">
        <label class="campo">Data da compra<input v-model="compra" type="date" required /></label>
        <button class="btn">Ver</button>
        <p v-if="fatura" class="resultado num">
          Fecha {{ data(fatura.fechamento) }} · vence {{ data(fatura.vencimento) }} · paga no ciclo
          <b>{{ ciclo(fatura.ciclo) }}</b>
        </p>
      </form>
    </section>

    <p v-if="erro" class="erro" role="alert">{{ erro }}</p>
  </div>
</template>

<style scoped>
.detalhe {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 14px 0 6px;
}
.linha {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
}
.nome {
  flex: 1 1 180px;
}
.dia input {
  width: 84px;
}
.check {
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 10px;
}
h3 {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
}
.historico {
  list-style: none;
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.historico b {
  color: var(--text);
  font-weight: 600;
  margin-right: 6px;
}
.resultado {
  font-size: 13px;
  padding-bottom: 10px;
}
</style>
