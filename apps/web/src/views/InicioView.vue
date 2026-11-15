<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { chamar, ErroDeApi } from '@/api/http'
import type { Pendencias, Projecao } from '@/api/tipos'
import AppShell from '@/components/AppShell.vue'
import InfoIcone from '@/components/InfoIcone.vue'
import DistribuicaoCapital from '@/components/inicio/DistribuicaoCapital.vue'
import GraficoReceitaResultado from '@/components/inicio/GraficoReceitaResultado.vue'
import SaidasDoCiclo from '@/components/inicio/SaidasDoCiclo.vue'
import { centavos, diasEntre, reaisCurto, semCentavos } from '@/components/inicio/formato'
import { ciclo as nomeDoCiclo, data } from '@/formato'

/** Tela inicial (HU-16), conforme docs/prototipos/01_inicio_desktop.html. */
const projecao = ref<Projecao | null>(null)
const pendencias = ref<number | null>(null)
const erro = ref('')
const carregando = ref(true)

onMounted(async () => {
  const [p, pend] = await Promise.allSettled([
    chamar<Projecao>('GET', '/projecao'),
    chamar<Pendencias>('GET', '/pendencias'),
  ])
  if (p.status === 'fulfilled') projecao.value = p.value
  else erro.value = p.reason instanceof ErroDeApi ? p.reason.message : 'Não foi possível carregar a projeção'
  if (pend.status === 'fulfilled') pendencias.value = pend.value.total
  carregando.value = false
})

const atual = computed(() => projecao.value?.ciclos[0] ?? null)
const pronta = computed(() => projecao.value?.configurada === true && atual.value !== null)

const titulo = computed(() => {
  const id = atual.value?.ciclo.id ?? projecao.value?.cicloAtual
  return id ? `Ciclo ${nomeDoCiclo(id)}` : 'Início'
})

const subtitulo = computed(() => {
  const c = atual.value?.ciclo
  if (!c) return ''
  const intervalo = `${data(c.inicio, true)} – ${data(c.fim, true)}`
  const hoje = projecao.value?.hoje
  if (!hoje) return intervalo
  const total = diasEntre(c.inicio, c.fim) + 1
  const dia = diasEntre(c.inicio, hoje) + 1
  return dia >= 1 && dia <= total ? `${intervalo} · dia ${dia}/${total}` : intervalo
})

/** CA3 (V-01): os indicadores dependem da data dos últimos dados gravados. */
const ultimosDados = computed(() =>
  projecao.value?.ultimosDados ? `dados até ${data(projecao.value.ultimosDados, true)}` : 'sem dados importados',
)

const livre = computed(() => {
  const l = projecao.value?.livreParaGastar
  if (!l) return null
  const orcamento = centavos(l.orcamento)
  const usado = centavos(l.usado)
  const valor = centavos(l.livre)
  return {
    valor,
    usado,
    orcamento,
    estourou: usado > orcamento,
    medidor: orcamento > 0 ? Math.min(100, Math.max(0, (usado / orcamento) * 100)) : usado > 0 ? 100 : 0,
  }
})

const resultado = computed(() => centavos(atual.value?.resultadoLiquido))

/** Variação do resultado líquido contra a projeção congelada na abertura do ciclo. */
const variacao = computed(() => {
  const cong = projecao.value?.congelamentoDoCicloAtual
  if (!cong || !atual.value || cong.ciclo !== atual.value.ciclo.id) return null
  const diferenca = resultado.value - centavos(cong.resultadoLiquido)
  return {
    diferenca,
    texto: diferenca === 0 ? `= ${reaisCurto(0)}` : `${diferenca > 0 ? '▲' : '▼'} ${reaisCurto(diferenca)}`,
    quando: data(cong.congeladaEm.slice(0, 10), true),
  }
})

const aporte = computed(() => centavos(atual.value?.aporte))
</script>

<template>
  <AppShell :titulo="titulo" :subtitulo="subtitulo">
    <template #acoes>
      <RouterLink
        class="ibtn"
        :to="{ name: 'transacoes', query: { aba: 'pendencias' } }"
        :aria-label="pendencias ? `Pendências: ${pendencias}` : 'Pendências'"
        title="Pendências"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 3 2.5 20h19L12 3z" />
          <path d="M12 10v4.5M12 17.5v.01" />
        </svg>
        <span v-if="pendencias" class="badge num">{{ pendencias }}</span>
      </RouterLink>
    </template>

    <p v-if="carregando" class="vazio">Carregando…</p>
    <p v-else-if="erro" class="erro" role="alert">{{ erro }}</p>

    <section v-else-if="projecao && !projecao.configurada" class="card configurar">
      <h2><span><InfoIcone texto="A projeção parte do salário: dele saem o dízimo, o aporte e a receita de cada ciclo." />Projeção não configurada</span></h2>
      <p>Para ver os indicadores e a projeção dos próximos ciclos, informe o salário.</p>
      <RouterLink :to="{ name: 'configuracoes' }" class="btn primario">Ir para Configurações</RouterLink>
    </section>

    <template v-else-if="pronta && atual && livre">
      <p class="atualizacao" :class="{ sem: !projecao?.ultimosDados }">
        <InfoIcone
          texto="Os indicadores usam os dados gravados até esta data. Envie documentos ao Claude a qualquer momento para atualizar."
        /><span class="num">{{ ultimosDados }}</span>
      </p>

      <section class="kpis">
        <div class="card kpi main">
          <div class="lbl">
            <InfoIcone
              texto="Quanto ainda cabe no orçamento de gastos flexíveis até o fim do ciclo: o orçamento do ciclo menos o que já foi gasto em flexíveis."
            /><span>Livre para gastar</span>
            <span class="chip num">até {{ data(atual.ciclo.fim, true) }}</span>
          </div>
          <div class="val num" :class="{ neg: livre.valor < 0 }"><small>{{ livre.valor < 0 ? '-' : '' }}R$</small>{{ semCentavos(livre.valor) }}</div>
          <div class="meter" :class="{ estourou: livre.estourou }"><i :style="{ width: `${livre.medidor}%` }"></i></div>
          <div class="meta num">
            <span>{{ reaisCurto(livre.usado) }} usados</span><span>orçamento {{ reaisCurto(livre.orcamento) }}</span>
          </div>
        </div>

        <div class="card kpi resultado">
          <div class="lbl">
            <InfoIcone
              :texto="`Receita do ciclo menos todas as saídas previstas: faturas, dízimo, fixas e aporte.${variacao ? ` O indicador compara com a projeção congelada na abertura do ciclo (${variacao.quando}).` : ' A variação aparece depois que a abertura do ciclo congela a projeção.'}`"
            /><span>Resultado líquido do ciclo</span>
          </div>
          <div class="val num" :class="{ neg: resultado < 0 }"><small>{{ resultado < 0 ? '-' : '' }}R$</small>{{ semCentavos(resultado) }}</div>
          <span
            v-if="variacao"
            class="chip variacao num"
            :class="variacao.diferenca > 0 ? 'up' : variacao.diferenca < 0 ? 'down' : ''"
            >{{ variacao.texto }}</span
          >
        </div>

        <div class="card kpi aporte">
          <div class="lbl">
            <InfoIcone
              direita
              texto="Valor destinado a investimento neste ciclo, calculado sobre o salário. Pode ser ajustado na abertura do ciclo."
            /><span>Aporte do ciclo</span>
          </div>
          <div class="val num"><small>R$</small>{{ semCentavos(aporte) }}</div>
          <span class="chip num">{{ atual.aportePercentual }}%{{ atual.ajustado ? ' · ajustado' : '' }}</span>
        </div>
      </section>

      <GraficoReceitaResultado :ciclos="projecao?.ciclos ?? []" />

      <div class="row2">
        <DistribuicaoCapital :ciclo="atual" />
        <SaidasDoCiclo :ciclo="atual" />
      </div>
    </template>
    <p v-else class="vazio">Nenhum ciclo projetado.</p>
  </AppShell>
</template>

<style scoped>
.ibtn {
  position: relative;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--card);
  display: grid;
  place-items: center;
  color: var(--muted);
}
.ibtn:hover {
  background: var(--elev);
  color: var(--text);
}
.ibtn svg {
  width: 17px;
  height: 17px;
}
.badge {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 9px;
  font-size: 10px;
  font-weight: 700;
  display: grid;
  place-items: center;
  color: #001533;
  background: var(--pending);
}
.configurar p {
  font-size: 14px;
  line-height: 1.5;
  margin-bottom: 14px;
}
.configurar .btn {
  display: inline-block;
  text-decoration: none;
}
.atualizacao {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  font-size: 12px;
  color: var(--muted);
  margin: -8px 0 10px;
}
.atualizacao.sem {
  color: var(--pending);
}
.kpis {
  display: grid;
  grid-template-columns: 1.3fr 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}
.kpi .lbl {
  font-size: 12px;
  color: var(--muted);
  letter-spacing: 0.02em;
  display: flex;
  align-items: center;
}
.kpi .lbl .chip {
  margin-left: auto;
}
.kpi .val {
  font-size: 30px;
  font-weight: 700;
  margin: 8px 0 10px;
  line-height: 1;
}
.kpi .val small {
  font-size: 16px;
  color: var(--muted);
  font-weight: 600;
  margin-right: 3px;
}
.kpi .val.neg {
  color: var(--out);
}
.kpi.main {
  background: linear-gradient(150deg, #00255a 0%, #001533 75%);
}
.kpi.main .val {
  font-size: 40px;
}
.chip {
  font-size: 12px;
  padding: 3px 8px;
}
.chip.up {
  background: rgba(0, 204, 75, 0.13);
  color: var(--in);
}
.chip.down {
  background: rgba(255, 107, 91, 0.13);
  color: var(--out);
}
.meter {
  height: 6px;
  background: var(--recess);
  overflow: hidden;
  margin-top: 12px;
}
.meter i {
  display: block;
  height: 100%;
  background: var(--accent);
}
.meter.estourou i {
  background: var(--out);
}
.meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--muted);
  margin-top: 6px;
}
.row2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 16px;
  align-items: start;
}

/* DS-10: indicadores em 2 colunas, caixas empilhadas. */
@media (max-width: 760px) {
  .kpis {
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 10px;
  }
  .kpi.main {
    grid-column: 1 / -1;
  }
  .kpi .val {
    font-size: 24px;
  }
  .kpi.main .val {
    font-size: 36px;
  }
  .row2 {
    grid-template-columns: 1fr;
    gap: 10px;
    margin-top: 10px;
  }
  .atualizacao {
    justify-content: flex-start;
    margin: 0 0 10px;
  }
}
</style>
