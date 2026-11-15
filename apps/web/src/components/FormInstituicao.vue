<script setup lang="ts">
import { ref } from 'vue'
import { chamar, ErroDeApi } from '@/api/http'
import type { Instituicao } from '@/api/tipos'

const props = defineProps<{ instituicao?: Instituicao }>()
const emit = defineEmits<{ salvo: [Instituicao]; cancelar: [] }>()

const nome = ref(props.instituicao?.nome ?? '')
const cor = ref(props.instituicao?.cor ?? '#5BA8FF')
const ativa = ref(props.instituicao?.ativa ?? true)
const erro = ref('')
const salvando = ref(false)

async function salvar() {
  salvando.value = true
  erro.value = ''
  try {
    const salvo = props.instituicao
      ? await chamar<Instituicao>('PATCH', `/instituicoes/${props.instituicao.id}`, {
          nome: nome.value,
          cor: cor.value,
          ativa: ativa.value,
        })
      : await chamar<Instituicao>('POST', '/instituicoes', { nome: nome.value, cor: cor.value })
    emit('salvo', salvo)
  } catch (e) {
    erro.value = e instanceof ErroDeApi ? e.message : 'Não foi possível salvar'
  } finally {
    salvando.value = false
  }
}
</script>

<template>
  <form class="form" @submit.prevent="salvar">
    <label class="campo nome">Nome<input v-model="nome" required maxlength="60" /></label>
    <label class="campo">Cor<input v-model="cor" type="color" /></label>
    <label v-if="instituicao" class="ativa"><input v-model="ativa" type="checkbox" /> Ativa</label>
    <div class="botoes">
      <button class="btn primario" :disabled="salvando || !nome.trim()">Salvar</button>
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
  flex: 1 1 200px;
}
.ativa {
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 10px;
}
.botoes {
  display: flex;
  gap: 8px;
}
.erro {
  flex-basis: 100%;
}
</style>
