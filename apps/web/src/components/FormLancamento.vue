<script setup lang="ts">
import { computed, ref } from 'vue'
import { chamar, ErroDeApi } from '@/api/http'
import type { Categoria, Conta, Transacao } from '@/api/tipos'
import InfoIcone from '@/components/InfoIcone.vue'
import SeletorCategoria from '@/components/SeletorCategoria.vue'
import { ciclo, data, hoje, reais } from '@/formato'

const props = defineProps<{ contas: Conta[]; categorias: Categoria[] }>()
const emit = defineEmits<{ salvo: [Transacao]; cancelar: [] }>()

type Sentido = 'saida' | 'entrada' | 'fora'
const sentido = ref<Sentido>('saida')
const contaId = ref(props.contas[0]?.id ?? '')
const dia = ref(hoje())
const descricao = ref('')
const valor = ref('')
const categoriaId = ref('')
const erro = ref('')
const salvando = ref(false)
const ultimo = ref<Transacao | null>(null)

const foraDasContas = computed(() => sentido.value === 'fora')

/** Aceita "47,90", "1.146,00" ou "47.90"; devolve o valor positivo com ponto decimal. */
function normalizar(texto: string): string | null {
  const t = texto.trim().replace(/\s|R\$/g, '')
  const decimal = /,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  return /^\d+(\.\d{1,2})?$/.test(decimal) && Number(decimal) > 0 ? decimal : null
}

async function salvar() {
  erro.value = ''
  const v = normalizar(valor.value)
  if (!v) {
    erro.value = 'Informe um valor maior que zero, ex.: 47,90'
    return
  }
  salvando.value = true
  try {
    const t = await chamar<Transacao>('POST', '/transacoes', {
      ...(foraDasContas.value ? { tipo: 'receita_fora_das_contas' } : { contaId: contaId.value }),
      data: dia.value,
      descricao: descricao.value,
      valor: sentido.value === 'saida' ? `-${v}` : v,
      ...(categoriaId.value ? { categoriaId: categoriaId.value } : {}),
    })
    ultimo.value = t
    descricao.value = ''
    valor.value = ''
    categoriaId.value = ''
    emit('salvo', t)
  } catch (e) {
    erro.value = e instanceof ErroDeApi ? e.message : 'Não foi possível salvar'
  } finally {
    salvando.value = false
  }
}
</script>

<template>
  <form class="form" @submit.prevent="salvar">
    <div class="sentido" role="radiogroup" aria-label="Tipo de lançamento">
      <button type="button" :class="{ on: sentido === 'saida' }" @click="sentido = 'saida'">Saída</button>
      <button type="button" :class="{ on: sentido === 'entrada' }" @click="sentido = 'entrada'">Entrada</button>
      <button type="button" :class="{ on: sentido === 'fora' }" @click="sentido = 'fora'">Fora das contas</button>
      <InfoIcone
        texto="Fora das contas: dinheiro que reduz um custo sem passar por banco, como a metade da faculdade paga pela mãe (D3). Não tem conta."
      />
    </div>
    <label v-if="!foraDasContas" class="campo">
      Conta
      <select v-model="contaId" required>
        <option v-for="c in contas" :key="c.id" :value="c.id">{{ c.instituicao.nome }} · {{ c.nome }}</option>
      </select>
    </label>
    <label class="campo">Data<input v-model="dia" type="date" required /></label>
    <label class="campo descricao">Descrição<input v-model="descricao" required maxlength="300" /></label>
    <label class="campo valor">Valor (R$)<input v-model="valor" inputmode="decimal" placeholder="0,00" required /></label>
    <label class="campo">Categoria<SeletorCategoria v-model="categoriaId" :categorias="categorias" vazio="Pelas regras" /></label>
    <div class="botoes">
      <button class="btn primario" :disabled="salvando">Lançar</button>
      <button type="button" class="btn" @click="emit('cancelar')">Fechar</button>
    </div>
    <p v-if="erro" class="erro" role="alert">{{ erro }}</p>
    <p v-else-if="ultimo" class="ok num" role="status">
      Lançado: {{ ultimo.descricao }} · {{ reais(ultimo.valor) }} · paga em {{ data(ultimo.dataPagamento) }} (ciclo
      {{ ciclo(ultimo.ciclo) }})
    </p>
  </form>
</template>

<style scoped>
.form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
}
.sentido {
  flex-basis: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
}
.sentido button {
  border: 1px solid var(--faint);
  background: var(--recess);
  color: var(--muted);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
}
.sentido button.on {
  background: var(--elev);
  color: var(--text);
  border-color: rgba(255, 255, 255, 0.25);
}
.descricao {
  flex: 1 1 200px;
}
.valor input {
  width: 120px;
}
.botoes {
  display: flex;
  gap: 8px;
}
.erro,
.ok {
  flex-basis: 100%;
  font-size: 13px;
}
.ok {
  color: var(--in);
}
</style>
