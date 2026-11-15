<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { chamar, ErroDeApi } from '@/api/http'
import type { Categoria, Ciclo, Conta, Lote, Pendencias, Transacao } from '@/api/tipos'
import AppShell from '@/components/AppShell.vue'
import FormLancamento from '@/components/FormLancamento.vue'
import InfoIcone from '@/components/InfoIcone.vue'
import SeletorCategoria from '@/components/SeletorCategoria.vue'
import { ciclo as nomeDoCiclo, data, paraCampo, reais, somarCiclos, TIPOS_DE_TRANSACAO, valorDigitado } from '@/formato'

type Aba = 'transacoes' | 'pendencias' | 'lotes'
const route = useRoute()
const router = useRouter()

const aba = ref<Aba>((route.query.aba as Aba) || 'transacoes')
const ciclo = ref<string>((route.query.ciclo as string) || '')
const cicloInfo = ref<Ciclo | null>(null)
const transacoes = ref<Transacao[]>([])
const soma = ref('0.00')
const total = ref(0)
const pendencias = ref<Pendencias | null>(null)
const lotes = ref<Lote[]>([])
const contas = ref<Conta[]>([])
const categorias = ref<Categoria[]>([])
const lancando = ref(false)
const aberta = ref<string | null>(null)
const confirmar = ref<string | null>(null)
const erro = ref('')
/** Por transação sem categoria: categoria escolhida e texto da regra (opcional). */
const escolha = ref<Record<string, { categoriaId: string; regra: string }>>({})

const contasAtivas = computed(() => contas.value.filter((c) => c.ativa && c.instituicao.ativa))

function falha(e: unknown) {
  erro.value = e instanceof ErroDeApi ? e.message : 'Não foi possível concluir'
}

async function carregarCiclo() {
  const lista = await chamar<Ciclo[]>('GET', `/ciclos?de=${ciclo.value}&ate=${ciclo.value}`)
  cicloInfo.value = lista[0] ?? null
}

async function carregar() {
  erro.value = ''
  try {
    const [t, p, l] = await Promise.all([
      chamar<{ transacoes: Transacao[]; total: number; soma: string }>('GET', `/transacoes?ciclo=${ciclo.value}&limite=500`),
      chamar<Pendencias>('GET', '/pendencias'),
      chamar<Lote[]>('GET', `/lotes?ciclo=${ciclo.value}`),
      carregarCiclo(),
    ])
    transacoes.value = t.transacoes
    total.value = t.total
    soma.value = t.soma
    pendencias.value = p
    lotes.value = l
    escolha.value = Object.fromEntries(
      p.semCategoria.map((x) => [x.id, escolha.value[x.id] ?? { categoriaId: '', regra: '' }]),
    )
  } catch (e) {
    falha(e)
  }
}

async function iniciar() {
  try {
    if (!ciclo.value) ciclo.value = (await chamar<Ciclo>('GET', '/ciclos/atual')).id
    ;[contas.value, categorias.value] = await Promise.all([
      chamar<Conta[]>('GET', '/contas?incluirInativas=true'),
      chamar<Categoria[]>('GET', '/categorias'),
    ])
    await carregar()
  } catch (e) {
    falha(e)
  }
}

watch([aba, ciclo], ([a, c]) => {
  void router.replace({ query: { aba: a, ciclo: c } })
})

function mudarCiclo(n: number) {
  ciclo.value = somarCiclos(ciclo.value, n)
  void carregar()
}

async function categorizar(t: Transacao, categoriaId: string) {
  try {
    await chamar('PATCH', `/transacoes/${t.id}`, { categoriaId: categoriaId || null })
    await carregar()
  } catch (e) {
    falha(e)
  }
}

/** Edição da transação aberta: descrição, data da compra e valor (DM-18, revisado em 15/11). */
const edicao = ref<{ descricao: string; data: string; valor: string } | null>(null)

function abrir(t: Transacao) {
  aberta.value = aberta.value === t.id ? null : t.id
  edicao.value = aberta.value ? { descricao: t.descricao, data: t.dataCompra, valor: paraCampo(t.valor) } : null
  confirmar.value = null
}

async function salvarEdicao(t: Transacao) {
  const e = edicao.value
  if (!e) return
  const valor = valorDigitado(e.valor)
  if (!valor) {
    erro.value = 'Valor inválido: use o sinal para saída, ex.: -47,90'
    return
  }
  const corpo: Record<string, string> = {}
  if (e.descricao.trim() && e.descricao.trim() !== t.descricao) corpo.descricao = e.descricao.trim()
  if (e.data !== t.dataCompra) corpo.data = e.data
  if (Number(valor) !== Number(t.valor)) corpo.valor = valor
  if (Object.keys(corpo).length === 0) return
  try {
    erro.value = ''
    await chamar('PATCH', `/transacoes/${t.id}`, corpo)
    aberta.value = null
    edicao.value = null
    await carregar()
  } catch (err) {
    falha(err)
  }
}

async function excluir(t: Transacao) {
  if (confirmar.value !== `excluir:${t.id}`) {
    confirmar.value = `excluir:${t.id}`
    return
  }
  confirmar.value = null
  try {
    await chamar('DELETE', `/transacoes/${t.id}`)
    aberta.value = null
    await carregar()
  } catch (e) {
    falha(e)
  }
}

async function resolver(corpo: object) {
  try {
    await chamar('POST', '/pendencias/resolver', corpo)
    await carregar()
  } catch (e) {
    falha(e)
  }
}

async function resolverCategoria(t: Transacao) {
  const e = escolha.value[t.id]
  if (!e?.categoriaId) return
  await resolver({
    tipo: 'categorizar',
    transacaoId: t.id,
    categoriaId: e.categoriaId,
    ...(e.regra.trim().length >= 2 ? { criarRegra: { padrao: e.regra.trim() } } : {}),
  })
}

async function desfazer(l: Lote) {
  if (confirmar.value !== `lote:${l.id}`) {
    confirmar.value = `lote:${l.id}`
    return
  }
  confirmar.value = null
  try {
    await chamar('POST', `/lotes/${l.id}/desfazer`)
    await carregar()
  } catch (e) {
    falha(e)
  }
}

const STATUS_DO_LOTE: Record<Lote['status'], string> = { aceito: 'aceito', nao_conferido: 'não conferido', desfeito: 'desfeito' }

onMounted(iniciar)
</script>

<template>
  <AppShell
    titulo="Transações"
    :subtitulo="cicloInfo ? `${nomeDoCiclo(cicloInfo.id)} · ${data(cicloInfo.inicio, true)} – ${data(cicloInfo.fim, true)}` : ''"
  >
    <template #acoes>
      <button class="btn" aria-label="Ciclo anterior" @click="mudarCiclo(-1)">‹</button>
      <button class="btn" aria-label="Próximo ciclo" @click="mudarCiclo(1)">›</button>
      <button class="btn primario" :disabled="contasAtivas.length === 0" @click="lancando = !lancando">Lançar</button>
    </template>

    <section v-if="lancando" class="card bloco">
      <h2><span><InfoIcone texto="Plano B do canal principal: lance aqui o que não veio por documento (HU-10)." />Lançamento manual</span></h2>
      <FormLancamento :contas="contasAtivas" :categorias="categorias" @salvo="carregar" @cancelar="lancando = false" />
    </section>

    <nav class="abas" role="tablist">
      <button role="tab" :aria-selected="aba === 'transacoes'" :class="{ on: aba === 'transacoes' }" @click="aba = 'transacoes'">
        Transações <span class="num">{{ total }}</span>
      </button>
      <button role="tab" :aria-selected="aba === 'pendencias'" :class="{ on: aba === 'pendencias' }" @click="aba = 'pendencias'">
        Pendências <span v-if="pendencias?.total" class="badge num">{{ pendencias.total }}</span>
      </button>
      <button role="tab" :aria-selected="aba === 'lotes'" :class="{ on: aba === 'lotes' }" @click="aba = 'lotes'">
        Lotes <span class="num">{{ lotes.length }}</span>
      </button>
    </nav>

    <p v-if="erro" class="erro bloco" role="alert">{{ erro }}</p>

    <!-- Transações do ciclo (pelo dia do pagamento) -->
    <section v-if="aba === 'transacoes'" class="card">
      <h2>
        <span><InfoIcone texto="Transações pagas neste ciclo. No cartão, a data que conta é o vencimento da fatura (RN-08)." />Pagas no ciclo</span>
        <span class="grow"></span>
        <span class="num" :class="soma.startsWith('-') ? 'neg' : 'pos'">{{ reais(soma) }}</span>
      </h2>
      <p v-if="transacoes.length === 0" class="vazio">Nenhuma transação neste ciclo.</p>
      <ul class="lista">
        <li v-for="t in transacoes" :key="t.id" :style="{ '--bk': t.conta?.cor ?? 'var(--restrict)' }">
          <button class="linha" :aria-expanded="aberta === t.id" @click="abrir(t)">
            <span class="dt num">{{ data(t.dataCompra, true) }}</span>
            <span class="desc">
              <b>{{ t.descricao }}</b>
              <span class="sub">
                {{ t.conta ? `${t.conta.instituicao} · ${t.conta.nome}` : 'Fora das contas' }}
                <template v-if="t.parcela"> · parcela {{ t.parcela.numero }}/{{ t.parcela.total }}</template>
                <template v-if="t.dataPagamento !== t.dataCompra"> · paga {{ data(t.dataPagamento, true) }}</template>
              </span>
            </span>
            <span class="cat">
              <span v-if="t.categoria" class="chip">{{ t.categoria.pai ? `${t.categoria.pai} · ` : '' }}{{ t.categoria.nome }}</span>
              <span v-else-if="t.tipo === 'transferencia' || t.tipo === 'pagamento_fatura'" class="chip">{{ TIPOS_DE_TRANSACAO[t.tipo] }}</span>
              <span v-else class="chip pend">sem categoria</span>
              <span v-if="t.duplicata" class="chip pend">duplicata?</span>
            </span>
            <span class="val num" :class="t.valor.startsWith('-') ? 'neg' : 'pos'">{{ reais(t.valor) }}</span>
          </button>
          <div v-if="aberta === t.id" class="detalhe">
            <label class="campo">
              Categoria
              <SeletorCategoria
                :model-value="t.categoria?.id ?? ''"
                :categorias="categorias"
                @update:model-value="categorizar(t, $event)"
              />
            </label>
            <span class="info-linha">
              {{ TIPOS_DE_TRANSACAO[t.tipo] }} · origem {{ t.origem }}
              <template v-if="t.descricaoOriginal !== t.descricao"> · original: {{ t.descricaoOriginal }}</template>
            </span>
            <button class="btn" :class="{ perigo: confirmar === `excluir:${t.id}` }" @click="excluir(t)">
              {{ confirmar === `excluir:${t.id}` ? 'Confirmar: mover para a lixeira' : 'Excluir' }}
            </button>
            <form v-if="edicao" class="edicao" @submit.prevent="salvarEdicao(t)">
              <label class="campo descricao">Descrição<input v-model="edicao.descricao" maxlength="300" /></label>
              <label class="campo">Data da compra<input v-model="edicao.data" type="date" required /></label>
              <label class="campo valor">
                <span><InfoIcone texto="Com sinal: negativo sai da conta, positivo entra. Ex.: -47,90." />Valor (R$)</span>
                <input v-model="edicao.valor" inputmode="decimal" required />
              </label>
              <button class="btn primario">Salvar</button>
              <p v-if="t.loteId" class="aviso">
                Veio de um lote: mudar o valor faz a soma deixar de bater com o total do documento. Se foi erro de leitura do
                documento inteiro, prefira desfazer o lote.
              </p>
            </form>
          </div>
        </li>
      </ul>
    </section>

    <!-- Pendências (UC-03, HU-13) -->
    <template v-if="aba === 'pendencias' && pendencias">
      <p v-if="pendencias.total === 0" class="vazio">Nenhuma pendência.</p>

      <section v-if="pendencias.semCategoria.length" class="card bloco">
        <h2>
          <span><InfoIcone texto="As regras não acharam categoria. Escolha uma; se quiser, informe um trecho do texto para criar uma regra e as próximas virem classificadas." />Sem categoria</span>
          <span class="chip num">{{ pendencias.semCategoria.length }}</span>
        </h2>
        <ul class="lista">
          <li v-for="t in pendencias.semCategoria" :key="t.id" :style="{ '--bk': t.conta?.cor ?? 'var(--restrict)' }">
            <div class="pendencia">
              <span class="desc">
                <b>{{ t.descricao }}</b>
                <span class="sub num">{{ data(t.dataCompra) }} · {{ t.conta ? `${t.conta.instituicao} · ${t.conta.nome}` : 'Fora das contas' }} · {{ reais(t.valor) }}</span>
              </span>
              <span v-if="escolha[t.id]" class="acoes-pend">
                <SeletorCategoria v-model="escolha[t.id]!.categoriaId" :categorias="categorias" vazio="Categoria…" class="sel" />
                <input v-model="escolha[t.id]!.regra" class="regra" placeholder="Regra (opcional): texto" maxlength="100" />
                <button class="btn primario" :disabled="!escolha[t.id]!.categoriaId" @click="resolverCategoria(t)">Resolver</button>
              </span>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="pendencias.possiveisDuplicatas.length" class="card bloco">
        <h2>
          <span><InfoIcone texto="Transações iguais a outra já gravada (mesma conta, data, valor e descrição). Nada é descartado sozinho (D2): decida se é a mesma transação." />Possíveis duplicatas</span>
          <span class="chip num">{{ pendencias.possiveisDuplicatas.length }}</span>
        </h2>
        <ul class="lista">
          <li v-for="d in pendencias.possiveisDuplicatas" :key="d.transacao.id" :style="{ '--bk': d.transacao.conta?.cor ?? 'var(--restrict)' }">
            <div class="pendencia">
              <span class="desc">
                <b>{{ d.transacao.descricao }} · {{ reais(d.transacao.valor) }}</b>
                <span class="sub num">
                  {{ data(d.transacao.dataCompra) }} · {{ d.transacao.conta?.instituicao }}
                  <template v-if="d.original"> · igual a "{{ d.original.descricao }}" já gravada</template>
                </span>
              </span>
              <span class="acoes-pend">
                <button class="btn" @click="resolver({ tipo: 'duplicata', transacaoId: d.transacao.id, decisao: 'manter' })">Não é duplicata</button>
                <button class="btn" @click="resolver({ tipo: 'duplicata', transacaoId: d.transacao.id, decisao: 'excluir' })">É duplicata: excluir</button>
              </span>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="pendencias.lotesNaoConferidos.length" class="card bloco">
        <h2>
          <span><InfoIcone texto="Lotes de documentos sem total nem saldo: a soma não pôde ser conferida (QA-04). Confira os itens e aceite, ou descarte o lote." />Lotes não conferidos</span>
        </h2>
        <ul class="lista">
          <li v-for="l in pendencias.lotesNaoConferidos" :key="l.id" :style="{ '--bk': l.conta.cor }">
            <div class="pendencia">
              <span class="desc">
                <b>{{ l.documento }}</b>
                <span class="sub num">{{ l.conta.instituicao }} · {{ l.conta.nome }} · {{ l.itens }} itens · {{ data(l.periodo.de, true) }} – {{ data(l.periodo.ate, true) }}</span>
              </span>
              <span class="acoes-pend">
                <RouterLink class="btn discreto" :to="{ query: { aba: 'transacoes', ciclo } }" @click="aba = 'transacoes'">Ver</RouterLink>
                <button class="btn" @click="resolver({ tipo: 'lote', loteId: l.id, decisao: 'aceitar' })">Aceitar</button>
                <button class="btn" @click="resolver({ tipo: 'lote', loteId: l.id, decisao: 'descartar' })">Descartar</button>
              </span>
            </div>
          </li>
        </ul>
      </section>
    </template>

    <!-- Lotes do ciclo -->
    <section v-if="aba === 'lotes'" class="card">
      <h2><span><InfoIcone texto="Cada documento lançado (pelo Claude ou pela tela) é um lote. Desfazer manda as transações do lote para a lixeira e permite reimportar o documento (HU-09)." />Lotes que cobrem o ciclo</span></h2>
      <p v-if="lotes.length === 0" class="vazio">Nenhum lote neste ciclo.</p>
      <ul class="lista">
        <li v-for="l in lotes" :key="l.id" :style="{ '--bk': l.conta.cor }" :class="{ desfeito: l.status === 'desfeito' }">
          <div class="pendencia">
            <span class="desc">
              <b>{{ l.documento }}</b>
              <span class="sub num">
                {{ l.conta.instituicao }} · {{ l.conta.nome }} · {{ l.itens }} itens
                <template v-if="l.duplicadas"> ({{ l.duplicadas }} possíveis duplicatas)</template>
                · {{ l.total ? `total ${reais(l.total)}` : l.saldoFinal ? `saldo final ${reais(l.saldoFinal)}` : 'sem total' }}
                · {{ l.fonte === 'claude' ? 'via Claude' : 'pela tela' }}
              </span>
            </span>
            <span class="acoes-pend">
              <span class="chip" :class="{ pend: l.status === 'nao_conferido', ok: l.status === 'aceito' }">{{ STATUS_DO_LOTE[l.status] }}</span>
              <button v-if="l.status !== 'desfeito'" class="btn" :class="{ perigo: confirmar === `lote:${l.id}` }" @click="desfazer(l)">
                {{ confirmar === `lote:${l.id}` ? 'Confirmar: desfazer' : 'Desfazer' }}
              </button>
            </span>
          </div>
        </li>
      </ul>
    </section>
  </AppShell>
</template>

<style scoped>
.bloco {
  margin-bottom: 16px;
}
.abas {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  background: var(--recess);
  border-radius: 999px;
  padding: 3px;
  width: fit-content;
  max-width: 100%;
  overflow-x: auto;
}
.abas button {
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  padding: 7px 14px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 6px;
}
.abas button.on {
  background: var(--elev);
  color: var(--text);
}
.badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  font-size: 11px;
  font-weight: 700;
  background: var(--pending);
  color: #001533;
  display: inline-grid;
  place-items: center;
}
.grow {
  flex: 1;
}
.lista {
  list-style: none;
}
.lista li {
  border-top: 1px solid var(--faint);
  box-shadow: inset 3px 0 0 var(--bk);
  padding-left: 14px;
}
.lista li.desfeito {
  opacity: 0.5;
}
.linha {
  width: 100%;
  display: grid;
  grid-template-columns: 48px minmax(0, 2fr) minmax(0, 1fr) 120px;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  background: transparent;
  border: 0;
  text-align: left;
  cursor: pointer;
  font-size: 14px;
}
.dt {
  color: var(--muted);
  font-size: 12px;
}
.desc {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.desc b {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sub {
  font-size: 12px;
  color: var(--muted);
}
.cat {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.chip.pend {
  background: rgba(254, 206, 76, 0.13);
  color: var(--pending);
}
.chip.ok {
  background: rgba(0, 204, 75, 0.13);
  color: var(--in);
}
.val {
  text-align: right;
  font-weight: 600;
}
.neg {
  color: var(--out);
}
.pos {
  color: var(--in);
}
.detalhe {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  padding: 4px 0 14px;
}
.info-linha {
  font-size: 12px;
  color: var(--muted);
  padding-bottom: 10px;
  flex: 1;
}
.edicao {
  flex-basis: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--faint);
}
.edicao .descricao {
  flex: 1 1 200px;
}
.edicao .valor input {
  width: 120px;
}
.aviso {
  flex-basis: 100%;
  font-size: 12px;
  color: var(--pending);
}
.btn.perigo {
  background: rgba(255, 107, 91, 0.18);
  color: var(--out);
}
.pendencia {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  flex-wrap: wrap;
}
.acoes-pend {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.acoes-pend .sel,
.acoes-pend .regra {
  background: var(--recess);
  border: 1px solid var(--faint);
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 13px;
  color: var(--text);
}
.regra {
  width: 170px;
}

/* DS-10: no celular, a categoria vai para baixo e a data some. */
@media (max-width: 760px) {
  .linha {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px 10px;
  }
  .dt {
    display: none;
  }
  .cat {
    grid-column: 1;
    grid-row: 2;
  }
  .val {
    grid-row: 1;
    grid-column: 2;
  }
  .acoes-pend .sel,
  .acoes-pend .regra {
    font-size: 16px;
    width: 100%;
  }
  .acoes-pend {
    width: 100%;
  }
}
</style>
