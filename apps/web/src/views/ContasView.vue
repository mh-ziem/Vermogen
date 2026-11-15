<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { chamar } from '@/api/http'
import type { Conta, Instituicao } from '@/api/tipos'
import AppShell from '@/components/AppShell.vue'
import ContaDetalhe from '@/components/ContaDetalhe.vue'
import FormConta from '@/components/FormConta.vue'
import FormInstituicao from '@/components/FormInstituicao.vue'
import InfoIcone from '@/components/InfoIcone.vue'
import { ciclo, data, desde, FINALIDADES, TIPOS } from '@/formato'

const instituicoes = ref<Instituicao[]>([])
const contas = ref<Conta[]>([])
const mostrarInativas = ref(false)
const carregando = ref(true)
const erro = ref('')
/** O que está aberto: 'nova-instituicao', 'nova-conta', 'inst:<id>' ou 'conta:<id>'. */
const aberto = ref<string | null>(null)

async function carregar() {
  erro.value = ''
  try {
    ;[instituicoes.value, contas.value] = await Promise.all([
      chamar<Instituicao[]>('GET', '/instituicoes?incluirInativas=true'),
      chamar<Conta[]>('GET', '/contas?incluirInativas=true'),
    ])
  } catch {
    erro.value = 'Não foi possível carregar as contas.'
  } finally {
    carregando.value = false
  }
}

const grupos = computed(() =>
  instituicoes.value
    .filter((i) => mostrarInativas.value || i.ativa)
    .map((i) => ({
      instituicao: i,
      contas: contas.value.filter((c) => c.instituicao.id === i.id && (mostrarInativas.value || c.ativa)),
    })),
)
const ativas = computed(() => instituicoes.value.filter((i) => i.ativa))

function alternar(chave: string) {
  aberto.value = aberto.value === chave ? null : chave
}

async function depoisDeSalvar() {
  aberto.value = null
  await carregar()
}

onMounted(carregar)
</script>

<template>
  <AppShell titulo="Contas">
    <template #acoes>
      <label class="inativas"><input v-model="mostrarInativas" type="checkbox" /> Mostrar inativas</label>
    </template>

    <div class="barra">
      <button class="btn" @click="alternar('nova-instituicao')">Nova instituição</button>
      <button class="btn" :disabled="ativas.length === 0" @click="alternar('nova-conta')">Nova conta</button>
    </div>

    <section v-if="aberto === 'nova-instituicao'" class="card">
      <h2>Nova instituição</h2>
      <FormInstituicao @salvo="depoisDeSalvar" @cancelar="aberto = null" />
    </section>
    <section v-if="aberto === 'nova-conta'" class="card">
      <h2>Nova conta</h2>
      <FormConta :instituicoes="ativas" @salvo="depoisDeSalvar" @cancelar="aberto = null" />
    </section>

    <p v-if="erro" class="erro" role="alert">{{ erro }}</p>
    <p v-else-if="!carregando && grupos.length === 0" class="vazio">
      Nenhuma instituição cadastrada. Comece por "Nova instituição".
    </p>

    <section v-for="g in grupos" :key="g.instituicao.id" class="card grupo">
      <h2>
        <span class="cor" :style="{ background: g.instituicao.cor }"></span>
        <span class="titulo">{{ g.instituicao.nome }}</span>
        <span v-if="!g.instituicao.ativa" class="chip">inativa</span>
        <span class="grow"></span>
        <button class="btn discreto" @click="alternar(`inst:${g.instituicao.id}`)">Editar</button>
      </h2>
      <FormInstituicao
        v-if="aberto === `inst:${g.instituicao.id}`"
        class="edicao"
        :instituicao="g.instituicao"
        @salvo="depoisDeSalvar"
        @cancelar="aberto = null"
      />

      <p v-if="g.contas.length === 0" class="vazio">Sem contas.</p>
      <ul class="contas">
        <!-- DS-06: a cor da instituição na lateral esquerda de cada linha. -->
        <li v-for="c in g.contas" :key="c.id" :style="{ '--bk': g.instituicao.cor }" :class="{ inativa: !c.ativa }">
          <button class="linha" :aria-expanded="aberto === `conta:${c.id}`" @click="alternar(`conta:${c.id}`)">
            <span class="principal">
              <b>{{ c.nome }}</b>
              <span class="tipo">{{ TIPOS[c.tipo] }}</span>
              <span v-if="!c.ativa" class="chip">inativa</span>
            </span>
            <span v-if="c.finalidade" class="finalidade">
              <span class="chip">{{ FINALIDADES[c.finalidade.atual] }}</span>
              <span class="desde">{{ desde(c.finalidade.desde) }}</span>
            </span>
            <span v-if="c.cartao" class="cartao num">
              <InfoIcone
                direita
                texto="Fatura em que uma compra feita hoje entra, com o vencimento já levado ao próximo dia útil, e o ciclo em que ela é paga."
              />
              fecha dia {{ c.cartao.diaFechamento }} · vence dia {{ c.cartao.diaVencimento }}
              <span class="proxima">
                compra hoje → vence {{ data(c.cartao.proximaFatura.vencimento, true) }} · {{ ciclo(c.cartao.proximaFatura.ciclo) }}
              </span>
            </span>
          </button>
          <ContaDetalhe v-if="aberto === `conta:${c.id}`" :conta="c" @alterada="carregar" />
        </li>
      </ul>
    </section>
  </AppShell>
</template>

<style scoped>
.barra {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.inativas {
  font-size: 13px;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 6px;
}
.card + .card {
  margin-top: 16px;
}
.barra + .card {
  margin-bottom: 16px;
}
.cor {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: none;
}
.titulo {
  color: var(--text);
  font-size: 15px;
}
.grow {
  flex: 1;
}
.edicao {
  margin-bottom: 14px;
}
.contas {
  list-style: none;
}
.contas li {
  border-top: 1px solid var(--faint);
  box-shadow: inset 3px 0 0 var(--bk);
  padding-left: 14px;
}
.contas li.inativa {
  opacity: 0.55;
}
.linha {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1.4fr);
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  background: transparent;
  border: 0;
  text-align: left;
  cursor: pointer;
  font-size: 14px;
}
.principal {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.principal b {
  font-weight: 600;
}
.tipo,
.desde {
  font-size: 12px;
  color: var(--muted);
}
.finalidade {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cartao {
  font-size: 12px;
  color: var(--muted);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 8px;
}
.proxima {
  color: var(--text);
}

/* DS-10: no celular, colunas secundárias vão para baixo do nome. */
@media (max-width: 760px) {
  .linha {
    grid-template-columns: 1fr;
    gap: 6px;
  }
}
</style>
