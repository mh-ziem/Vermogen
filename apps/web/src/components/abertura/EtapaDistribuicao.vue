<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Abertura } from '@/api/tipos'
import InfoIcone from '@/components/InfoIcone.vue'
import ListaDeItens from '@/components/projecao/ListaDeItens.vue'
import {
  BASES_DA_FIXA,
  dinheiroDigitado,
  ORIGENS_DO_ITEM,
  percentual,
  STATUS_DA_FATURA,
  VEREDITOS,
} from '@/components/projecao/formato'
import { ciclo as nomeDoCiclo, data, paraCampo, reais } from '@/formato'

const props = defineProps<{ abertura: Abertura; salvando?: boolean; erro?: string }>()
const emit = defineEmits<{ plano: [{ aporte: string; orcamentoFlexiveis: string }] }>()

const d = computed(() => props.abertura.distribuicao)

// Campos editáveis (HU-17 CA4): sempre a partir do plano devolvido pela API.
const aporte = ref('')
const orcamento = ref('')
const invalido = ref('')
watch(
  () => props.abertura.plano,
  (p) => {
    aporte.value = paraCampo(p.aporte)
    orcamento.value = paraCampo(p.orcamentoFlexiveis)
  },
  { immediate: true },
)

function enviar() {
  const a = dinheiroDigitado(aporte.value)
  const o = dinheiroDigitado(orcamento.value)
  if (a === null || o === null) {
    invalido.value = 'Valor inválido: use um valor positivo, ex.: 460,00'
    return
  }
  invalido.value = ''
  const p = props.abertura.plano
  if (Number(a) === Number(p.aporte) && Number(o) === Number(p.orcamentoFlexiveis)) return
  emit('plano', { aporte: a, orcamentoFlexiveis: o })
}

interface Linha {
  chave: string
  rotulo: string
  cor: string
  nota: string
  notaClasse?: string
  valor: string
  bk?: string
  itens?: { descricao: string; valor: string; nota?: string }[]
}

const linhas = computed<Linha[]>(() => {
  const c = d.value
  const instituicoes = c.faturas.map((f) => f.conta.instituicao)
  const lista: Linha[] = [
    { chave: 'receita', rotulo: 'Receita · salário', cor: '#fff', nota: '', valor: c.receita },
    { chave: 'dizimo', rotulo: 'Dízimo · 10%', cor: 'var(--c-dizimo)', nota: 'automático', valor: c.dizimo },
    ...c.faturas.map((f) => ({
      chave: `fatura:${f.conta.id}`,
      rotulo:
        instituicoes.filter((i) => i === f.conta.instituicao).length > 1
          ? `Fatura ${f.conta.instituicao} · ${f.conta.nome}`
          : `Fatura ${f.conta.instituicao}`,
      cor: 'var(--c-faturas)',
      nota: `${STATUS_DA_FATURA[f.status]} · vence ${data(f.vencimento, true)}`,
      notaClasse: f.status === 'a_importar' ? 'pend' : undefined,
      valor: f.valor,
      bk: f.conta.cor,
      itens: f.itens.map((it) => ({
        descricao: it.descricao,
        valor: it.valor,
        nota: it.origem === 'realizado' ? undefined : ORIGENS_DO_ITEM[it.origem],
      })),
    })),
  ]
  if (Number(c.flexiveisNosCartoes.valor) !== 0) {
    lista.push({
      chave: 'flexiveis',
      rotulo: 'Flexíveis do ciclo anterior',
      cor: 'var(--c-faturas)',
      nota: 'estimativa',
      valor: c.flexiveisNosCartoes.valor,
      itens: [
        { descricao: 'Orçamento do ciclo anterior', valor: c.flexiveisNosCartoes.orcamentoDoCicloAnterior },
        { descricao: 'Gasto no ciclo anterior', valor: c.flexiveisNosCartoes.gastoNoCicloAnterior },
        { descricao: 'Ainda não gasto, nas faturas', valor: c.flexiveisNosCartoes.valor },
      ],
    })
  }
  lista.push({
    chave: 'fixas',
    rotulo: 'Fixas e intermitentes',
    cor: 'var(--c-fixas)',
    nota: 'maior dos últimos 3 ciclos',
    valor: c.totais.fixas,
    itens: c.fixas.map((f) => ({ descricao: f.descricao, valor: f.valor, nota: BASES_DA_FIXA[f.base] })),
  })
  return lista
})

/** Barra empilhada: cada parte sobre a receita (ou sobre o total de saídas, se passar dela). */
const barra = computed(() => {
  const c = d.value
  const partes = [
    { rotulo: 'Faturas', valor: Math.abs(Number(c.totais.faturas)), cor: 'var(--c-faturas)' },
    { rotulo: 'Dízimo', valor: Math.abs(Number(c.dizimo)), cor: 'var(--c-dizimo)' },
    { rotulo: 'Fixas e intermitentes', valor: Math.abs(Number(c.totais.fixas)), cor: 'var(--c-fixas)' },
    { rotulo: 'Aporte', valor: Math.abs(Number(c.aporte)), cor: 'var(--c-aporte)' },
    { rotulo: 'Líquido projetado', valor: Math.max(Number(c.resultadoLiquido), 0), cor: 'var(--c-result)' },
  ]
  const base = Math.max(Number(c.receita), partes.reduce((s, p) => s + p.valor, 0))
  return base > 0 ? partes.filter((p) => p.valor > 0).map((p) => ({ ...p, largura: (p.valor / base) * 100 })) : []
})

const abertas = ref(new Set<string>())
function alternar(chave: string) {
  const s = new Set(abertas.value)
  if (s.has(chave)) s.delete(chave)
  else s.add(chave)
  abertas.value = s
}

const veredito = computed(() => VEREDITOS[d.value.veredito])
const infoLiquido = computed(
  () =>
    `Receita menos dízimo, faturas, fixas e aporte. Positivo: a partir da folga mínima (${reais(props.abertura.folgaMinima)}); moderado: entre zero e a folga; negativo: abaixo de zero (RN-16).`,
)
</script>

<template>
  <section class="card">
    <h2>
      <span>
        <InfoIcone
          texto="Proposta de destino da receita do novo ciclo. Aporte e orçamento de flexíveis podem ser ajustados só para este ciclo; o líquido projetado é recalculado. Clique numa linha para ver os itens."
        />Distribuição de capital · ciclo {{ nomeDoCiclo(abertura.ciclo.id) }}
      </span>
      <span class="grow"></span>
      <span v-if="abertura.plano.ajustado" class="chip">Ajustado</span>
    </h2>

    <p v-if="Number(d.receita) === 0" class="vazio">
      Salário não informado · <RouterLink :to="{ name: 'configuracoes' }">Configurações</RouterLink>
    </p>

    <div class="stack" aria-hidden="true">
      <span v-for="p in barra" :key="p.rotulo" :title="p.rotulo" :style="{ width: `${p.largura}%`, background: p.cor }"></span>
    </div>

    <div class="tabela">
      <table class="dist">
        <tbody>
          <template v-for="l in linhas" :key="l.chave">
            <tr
              :class="{ click: !!l.itens, open: abertas.has(l.chave), bk: !!l.bk }"
              :style="l.bk ? { '--bk': l.bk } : undefined"
              :tabindex="l.itens ? 0 : undefined"
              :aria-expanded="l.itens ? abertas.has(l.chave) : undefined"
              @click="l.itens && alternar(l.chave)"
              @keydown.enter="l.itens && alternar(l.chave)"
            >
              <td><span class="dot" :style="{ background: l.cor }"></span>{{ l.rotulo }}</td>
              <td class="m" :class="l.notaClasse">{{ l.nota }}</td>
              <td class="r num">{{ reais(l.valor) }}</td>
            </tr>
            <tr v-if="l.itens && abertas.has(l.chave)" class="det">
              <td colspan="3"><ListaDeItens :itens="l.itens" :cor="l.bk" /></td>
            </tr>
          </template>
          <tr>
            <td><span class="dot" style="background: var(--c-aporte)"></span>Aporte</td>
            <td class="m num">{{ percentual(abertura.plano.aporte, d.receita) }} do salário</td>
            <td class="r">
              <input
                v-model="aporte"
                class="inp money num"
                inputmode="decimal"
                aria-label="Aporte do ciclo (R$)"
                :disabled="salvando"
                @change="enviar"
              />
            </td>
          </tr>
          <tr class="total">
            <td><span class="dot" style="background: var(--c-result)"></span><InfoIcone :texto="infoLiquido" />Líquido projetado</td>
            <td><span class="chip" :class="veredito.classe">{{ veredito.rotulo }}</span></td>
            <td class="r num" :class="Number(d.resultadoLiquido) < 0 ? 'neg' : ''">{{ reais(d.resultadoLiquido) }}</td>
          </tr>
          <tr class="separado">
            <td><span class="dot" style="background: var(--accent)"></span>Orçamento de flexíveis</td>
            <td class="m">gasto neste ciclo, pago no próximo</td>
            <td class="r">
              <input
                v-model="orcamento"
                class="inp money num"
                inputmode="decimal"
                aria-label="Orçamento de flexíveis do ciclo (R$)"
                :disabled="salvando"
                @change="enviar"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="invalido || erro" class="erro" role="alert">{{ invalido || erro }}</p>
  </section>
</template>

<style scoped src="../projecao/comum.css"></style>
<style scoped>
/* DS-02: barra de dados reta. */
.stack {
  display: flex;
  height: 14px;
  gap: 2px;
  margin: 6px 0 16px;
}
.stack span {
  display: block;
  height: 100%;
}
.inp {
  background: var(--recess);
  border: 1px solid var(--faint);
  border-radius: 9px;
  color: var(--text);
  font-size: 13px;
  padding: 7px 9px;
}
.money {
  width: 120px;
  text-align: right;
}
tr.total td {
  font-weight: 700;
  color: var(--text);
}
tr.separado td {
  padding-top: 22px;
}
.erro {
  margin-top: 12px;
}
.vazio a {
  color: var(--accent);
}
@media (max-width: 760px) {
  .dist td.m {
    font-size: 0;
    padding-left: 0;
    padding-right: 0;
    width: 0;
  }
  .dist td.r {
    white-space: nowrap;
  }
  .money {
    width: 104px;
    font-size: 16px;
  }
}
</style>
