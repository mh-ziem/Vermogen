<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { chamar, ErroDeApi } from '@/api/http'
import type { Abertura, Congelamento } from '@/api/tipos'
import EtapaConfirmacao from '@/components/abertura/EtapaConfirmacao.vue'
import EtapaDistribuicao from '@/components/abertura/EtapaDistribuicao.vue'
import EtapaEntrada from '@/components/abertura/EtapaEntrada.vue'
import EtapaPendencias from '@/components/abertura/EtapaPendencias.vue'
import AppShell from '@/components/AppShell.vue'
import InfoIcone from '@/components/InfoIcone.vue'
import { dataHora } from '@/components/projecao/formato'
import { ciclo as nomeDoCiclo, data, reais } from '@/formato'

/** Procedimento de abertura do ciclo (UC-01, HU-17). A etapa "Fechamento" do protótipo é da Fase 2. */
const ETAPAS = [
  {
    nome: 'Entrada de dados',
    info: 'Envie ao Claude os extratos e faturas do ciclo anterior, um por conta, ou lance manualmente. Cada documento vira um lote; a etapa termina quando todas as contas têm lote aceito.',
  },
  {
    nome: 'Pendências',
    info: 'Resolva o que as regras não decidiram sozinhas: categorizar, confirmar duplicatas e aceitar lotes sem total. Pode ser feito na tela de transações ou pelo Claude.',
  },
  {
    nome: 'Distribuição',
    info: 'Revise a divisão da receita do novo ciclo. Ajuste o aporte e o orçamento de flexíveis, se precisar. Clique numa linha para ver os itens.',
  },
  {
    nome: 'Confirmação',
    info: 'Confira o resumo e congele a projeção. Ela será comparada com o realizado no fim do ciclo, na próxima abertura.',
  },
]

const abertura = ref<Abertura | null>(null)
const atual = ref(0)
const maisLonge = ref(0)
const erro = ref('')
const erroDoPlano = ref('')
const erroDoCongelamento = ref('')
const salvando = ref(false)
const congelando = ref(false)

function mensagem(e: unknown) {
  return e instanceof ErroDeApi ? e.message : 'Não foi possível concluir'
}

async function carregar() {
  erro.value = ''
  try {
    abertura.value = await chamar<Abertura>('GET', '/abertura')
  } catch (e) {
    erro.value = mensagem(e)
  }
}

function ir(i: number) {
  atual.value = Math.max(0, Math.min(ETAPAS.length - 1, i))
  maisLonge.value = Math.max(maisLonge.value, atual.value)
}

const aceitos = computed(() => abertura.value?.entrada.filter((e) => e.status === 'aceito').length ?? 0)
const esperadas = computed(() => abertura.value?.entrada.length ?? 0)

/** Status de cada etapa: [concluída?, texto]. */
const status = computed<[boolean, string][]>(() => {
  const a = abertura.value
  if (!a) return ETAPAS.map(() => [false, '—'])
  return [
    [esperadas.value > 0 && aceitos.value === esperadas.value, `${aceitos.value}/${esperadas.value} contas`],
    a.pendencias.total === 0 ? [true, 'Concluída'] : [false, `${a.pendencias.total} em aberto`],
    maisLonge.value > 2 || a.plano.ajustado ? [true, a.plano.ajustado ? 'Ajustada' : 'Revisada'] : [false, '—'],
    a.congelamento ? [true, `Congelada ${dataHora(a.congelamento.congeladaEm).slice(0, 5)}`] : [false, '—'],
  ]
})

async function salvarPlano(plano: { aporte: string; orcamentoFlexiveis: string }) {
  erroDoPlano.value = ''
  salvando.value = true
  try {
    abertura.value = await chamar<Abertura>('PUT', '/abertura/plano', plano)
  } catch (e) {
    erroDoPlano.value = mensagem(e)
  } finally {
    salvando.value = false
  }
}

async function congelar() {
  if (!abertura.value) return
  erroDoCongelamento.value = ''
  congelando.value = true
  try {
    const c = await chamar<Congelamento>('POST', '/abertura/congelar')
    abertura.value = { ...abertura.value, congelamento: c }
  } catch (e) {
    erroDoCongelamento.value = mensagem(e)
  } finally {
    congelando.value = false
  }
}

onMounted(carregar)
</script>

<template>
  <AppShell
    titulo="Abertura do ciclo"
    :subtitulo="abertura ? `${nomeDoCiclo(abertura.ciclo.id)} · ${data(abertura.ciclo.inicio, true)} – ${data(abertura.ciclo.fim, true)}` : ''"
  >
    <p v-if="erro" class="erro bloco" role="alert">{{ erro }}</p>

    <template v-if="abertura">
      <nav class="steps" aria-label="Etapas da abertura">
        <div
          v-for="(e, i) in ETAPAS"
          :key="e.nome"
          role="button"
          tabindex="0"
          class="step"
          :class="{ done: status[i]?.[0], cur: i === atual }"
          :aria-current="i === atual ? 'step' : undefined"
          @click="ir(i)"
          @keydown.enter.self="ir(i)"
        >
          <span class="bar"></span>
          <span class="n num">ETAPA {{ i + 1 }}</span>
          <span class="t"><InfoIcone :texto="e.info" :direita="i >= 2" />{{ e.nome }}</span>
          <span class="s num">{{ status[i]?.[1] }}</span>
        </div>
      </nav>

      <div class="layout">
        <div class="principal">
          <EtapaEntrada v-if="atual === 0" :abertura="abertura" />
          <EtapaPendencias v-else-if="atual === 1" :pendencias="abertura.pendencias" />
          <EtapaDistribuicao
            v-else-if="atual === 2"
            :abertura="abertura"
            :salvando="salvando"
            :erro="erroDoPlano"
            @plano="salvarPlano"
          />
          <EtapaConfirmacao
            v-else
            :abertura="abertura"
            :congelando="congelando"
            :erro="erroDoCongelamento"
            @congelar="congelar"
          />

          <div class="nav">
            <button type="button" class="btn ghost lg" :disabled="atual === 0" @click="ir(atual - 1)">Voltar</button>
            <button
              type="button"
              class="btn primario lg"
              :style="{ visibility: atual === ETAPAS.length - 1 ? 'hidden' : 'visible' }"
              @click="ir(atual + 1)"
            >
              Avançar
            </button>
          </div>
        </div>

        <aside class="card side">
          <h2>
            <span>
              <InfoIcone
                direita
                texto="Situação do procedimento: contas com lote aceito, pendências em aberto e líquido projetado do novo ciclo."
              />Resumo
            </span>
          </h2>
          <div class="row"><span>Lotes aceitos</span><b class="num">{{ aceitos }}/{{ esperadas }}</b></div>
          <div class="row"><span>Pendências</span><b class="num" :class="{ pend: abertura.pendencias.total }">{{ abertura.pendencias.total }}</b></div>
          <div class="row">
            <span>Líquido projetado</span>
            <b class="num" :class="{ neg: Number(abertura.distribuicao.resultadoLiquido) < 0 }">{{ reais(abertura.distribuicao.resultadoLiquido) }}</b>
          </div>
        </aside>
      </div>
    </template>
  </AppShell>
</template>

<style scoped>
.bloco {
  margin-bottom: 16px;
}
.steps {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}
.step {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  background: var(--card);
  padding: 12px 14px 14px;
  cursor: pointer;
  position: relative;
  border-radius: 12px;
  overflow: visible;
}
.step .bar {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 3px;
  background: var(--faint);
}
.step.done .bar {
  background: var(--in);
}
.step.cur .bar {
  background: var(--accent);
}
.step .n {
  font-size: 11px;
  color: var(--muted);
  letter-spacing: 0.04em;
}
.step .t {
  font-size: 14px;
  font-weight: 600;
  margin-top: 4px;
  color: var(--muted);
}
.step.cur .t,
.step.done .t {
  color: var(--text);
}
.step .s {
  font-size: 11px;
  margin-top: 4px;
  color: var(--muted);
}
.step.done .s {
  color: var(--in);
}
.layout {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 16px;
  align-items: start;
}
.principal {
  min-width: 0;
}
.nav {
  display: flex;
  justify-content: space-between;
  margin-top: 16px;
}
.btn.lg {
  padding: 12px 18px;
  font-size: 14px;
}
.btn.ghost {
  background: transparent;
  color: var(--muted);
  border: 1px solid var(--faint);
}
.side .row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-top: 1px solid var(--faint);
  font-size: 13px;
}
.side h2 + .row {
  border-top: 0;
}
.side .row span {
  color: var(--muted);
}
.side .row b {
  font-weight: 600;
}
.pend {
  color: var(--pending);
}
.neg {
  color: var(--out);
}

/* DS-10: etapas rolam na horizontal; o resumo vai para cima. */
@media (max-width: 760px) {
  .steps {
    display: flex;
    overflow-x: auto;
    gap: 8px;
    margin: 0 -16px 12px;
    padding: 0 16px;
    scrollbar-width: none;
  }
  .steps::-webkit-scrollbar {
    display: none;
  }
  .step {
    flex: 0 0 148px;
  }
  .layout {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .side {
    order: -1;
  }
}
</style>
