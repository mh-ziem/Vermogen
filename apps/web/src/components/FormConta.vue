<script setup lang="ts">
import { computed, ref } from 'vue'
import { chamar, ErroDeApi } from '@/api/http'
import type { Conta, Finalidade, Instituicao, TipoDeConta } from '@/api/tipos'
import InfoIcone from '@/components/InfoIcone.vue'
import { FINALIDADES, TIPOS } from '@/formato'

const props = defineProps<{ instituicoes: Instituicao[]; instituicaoId?: string }>()
const emit = defineEmits<{ salvo: [Conta]; cancelar: [] }>()

const instituicaoId = ref(props.instituicaoId ?? props.instituicoes[0]?.id ?? '')
const nome = ref('')
const tipo = ref<TipoDeConta>('corrente')
const finalidade = ref<Finalidade>('gasto')
const desde = ref('')
const diaFechamento = ref<number | ''>('')
const diaVencimento = ref<number | ''>('')
const erro = ref('')
const salvando = ref(false)
const cartao = computed(() => tipo.value === 'cartao')

async function salvar() {
  salvando.value = true
  erro.value = ''
  try {
    const conta = await chamar<Conta>('POST', '/contas', {
      instituicaoId: instituicaoId.value,
      nome: nome.value,
      tipo: tipo.value,
      finalidade: finalidade.value,
      ...(desde.value ? { finalidadeDesde: desde.value } : {}),
      ...(cartao.value ? { diaFechamento: Number(diaFechamento.value), diaVencimento: Number(diaVencimento.value) } : {}),
    })
    emit('salvo', conta)
  } catch (e) {
    erro.value = e instanceof ErroDeApi ? e.message : 'Não foi possível salvar'
  } finally {
    salvando.value = false
  }
}
</script>

<template>
  <form class="form" @submit.prevent="salvar">
    <label class="campo">
      Instituição
      <select v-model="instituicaoId" required>
        <option v-for="i in instituicoes" :key="i.id" :value="i.id">{{ i.nome }}</option>
      </select>
    </label>
    <label class="campo nome">Nome<input v-model="nome" required maxlength="60" placeholder="Ex.: Cartão" /></label>
    <label class="campo">
      <span><InfoIcone texto="O comportamento da conta no app. Não muda depois do cadastro: um cartão não vira conta corrente." />Tipo</span>
      <select v-model="tipo">
        <option v-for="(rotulo, valor) in TIPOS" :key="valor" :value="valor">{{ rotulo }}</option>
      </select>
    </label>
    <label class="campo">
      <span><InfoIcone texto="O papel da conta no seu planejamento. Pode mudar depois, a partir de uma data, sem reescrever o passado." />Finalidade</span>
      <select v-model="finalidade">
        <option v-for="(rotulo, valor) in FINALIDADES" :key="valor" :value="valor">{{ rotulo }}</option>
      </select>
    </label>
    <label class="campo">
      <span><InfoIcone texto="Em branco: a finalidade vale para todo o histórico da conta." />Finalidade desde</span>
      <input v-model="desde" type="date" />
    </label>
    <template v-if="cartao">
      <label class="campo dia">Fecha dia<input v-model.number="diaFechamento" type="number" min="1" max="31" required /></label>
      <label class="campo dia">Vence dia<input v-model.number="diaVencimento" type="number" min="1" max="31" required /></label>
    </template>
    <div class="botoes">
      <button class="btn primario" :disabled="salvando || !nome.trim() || !instituicaoId">Salvar</button>
      <button type="button" class="btn" @click="emit('cancelar')">Cancelar</button>
    </div>
    <p v-if="erro" class="erro" role="alert">{{ erro }}</p>
  </form>
</template>

<style scoped>
.form {
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
.botoes {
  display: flex;
  gap: 8px;
}
.erro {
  flex-basis: 100%;
}
</style>
