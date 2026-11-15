<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { chamar, ErroDeApi } from '@/api/http'
import type { Categoria, Conta, Natureza, Regra, TipoDeTransacao } from '@/api/tipos'
import InfoIcone from '@/components/InfoIcone.vue'
import SeletorCategoria from '@/components/SeletorCategoria.vue'
import { NATUREZAS, reais, TIPOS_DE_TRANSACAO } from '@/formato'

const categorias = ref<Categoria[]>([])
const regras = ref<Regra[]>([])
const contas = ref<Conta[]>([])
const erro = ref('')

const novaCat = ref({ nome: '', paiId: '', natureza: '' as Natureza | '' })
const novaRegra = ref({ padrao: '', categoriaId: '', tipo: '' as TipoDeTransacao | '', contaId: '', valorMinimo: '', valorMaximo: '', prioridade: 0 })

const raizes = computed(() => categorias.value.filter((c) => !c.paiId))
const filhas = (id: string) => categorias.value.filter((c) => c.paiId === id)
const nomeDaCategoria = (id: string | null) => {
  const c = categorias.value.find((x) => x.id === id)
  if (!c) return '—'
  const pai = categorias.value.find((x) => x.id === c.paiId)
  return pai ? `${pai.nome} · ${c.nome}` : c.nome
}
const nomeDaConta = (id: string | null) => {
  const c = contas.value.find((x) => x.id === id)
  return c ? `${c.instituicao.nome} · ${c.nome}` : 'qualquer conta'
}

function falha(e: unknown) {
  erro.value = e instanceof ErroDeApi ? e.message : 'Não foi possível concluir'
}

async function carregar() {
  try {
    ;[categorias.value, regras.value, contas.value] = await Promise.all([
      chamar<Categoria[]>('GET', '/categorias?incluirInativas=true'),
      chamar<Regra[]>('GET', '/regras'),
      chamar<Conta[]>('GET', '/contas'),
    ])
  } catch (e) {
    falha(e)
  }
}

/** "47,90" ou "47.90" → "47.90"; vazio → undefined. */
function valorOuNada(texto: string): string | undefined {
  const t = texto.trim()
  if (!t) return undefined
  return /,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t
}

async function criarCategoria() {
  erro.value = ''
  try {
    await chamar('POST', '/categorias', {
      nome: novaCat.value.nome,
      ...(novaCat.value.paiId ? { paiId: novaCat.value.paiId } : {}),
      ...(novaCat.value.natureza ? { natureza: novaCat.value.natureza } : {}),
    })
    novaCat.value = { nome: '', paiId: novaCat.value.paiId, natureza: '' }
    await carregar()
  } catch (e) {
    falha(e)
  }
}

async function alternarCategoria(c: Categoria) {
  try {
    await chamar('PATCH', `/categorias/${c.id}`, { ativa: !c.ativa })
    await carregar()
  } catch (e) {
    falha(e)
  }
}

async function criarRegra() {
  erro.value = ''
  const r = novaRegra.value
  try {
    await chamar('POST', '/regras', {
      padrao: r.padrao,
      ...(r.categoriaId ? { categoriaId: r.categoriaId } : {}),
      ...(r.tipo ? { tipo: r.tipo } : {}),
      ...(r.contaId ? { contaId: r.contaId } : {}),
      ...(valorOuNada(r.valorMinimo) ? { valorMinimo: valorOuNada(r.valorMinimo) } : {}),
      ...(valorOuNada(r.valorMaximo) ? { valorMaximo: valorOuNada(r.valorMaximo) } : {}),
      ...(r.prioridade ? { prioridade: Number(r.prioridade) } : {}),
    })
    novaRegra.value = { padrao: '', categoriaId: '', tipo: '', contaId: '', valorMinimo: '', valorMaximo: '', prioridade: 0 }
    await carregar()
  } catch (e) {
    falha(e)
  }
}

async function alternarRegra(r: Regra) {
  try {
    await chamar('PATCH', `/regras/${r.id}`, { ativa: !r.ativa })
    await carregar()
  } catch (e) {
    falha(e)
  }
}

onMounted(carregar)
</script>

<template>
  <section class="card">
    <h2>
      <span><InfoIcone texto="Categorias em dois níveis: categoria e subcategoria. A natureza (Intermitente, Parcelada, Pontual, Flexível) é a taxonomia da planilha (P3)." />Categorias</span>
    </h2>
    <p v-if="raizes.length === 0" class="vazio">Nenhuma categoria. Crie as da sua planilha abaixo.</p>
    <ul class="arvore">
      <li v-for="r in raizes" :key="r.id" :class="{ inativa: !r.ativa }">
        <div class="item">
          <b>{{ r.nome }}</b>
          <span v-if="r.natureza" class="chip">{{ NATUREZAS[r.natureza] }}</span>
          <span v-if="!r.ativa" class="chip">inativa</span>
          <button class="btn discreto" @click="alternarCategoria(r)">{{ r.ativa ? 'Desativar' : 'Ativar' }}</button>
        </div>
        <ul v-if="filhas(r.id).length">
          <li v-for="f in filhas(r.id)" :key="f.id" :class="{ inativa: !f.ativa }">
            <div class="item">
              {{ f.nome }}
              <span v-if="f.natureza" class="chip">{{ NATUREZAS[f.natureza] }}</span>
              <span v-if="!f.ativa" class="chip">inativa</span>
              <button class="btn discreto" @click="alternarCategoria(f)">{{ f.ativa ? 'Desativar' : 'Ativar' }}</button>
            </div>
          </li>
        </ul>
      </li>
    </ul>
    <form class="form" @submit.prevent="criarCategoria">
      <label class="campo nome">Nova categoria<input v-model="novaCat.nome" required maxlength="60" /></label>
      <label class="campo">
        Dentro de
        <select v-model="novaCat.paiId">
          <option value="">— primeiro nível —</option>
          <option v-for="r in raizes.filter((x) => x.ativa)" :key="r.id" :value="r.id">{{ r.nome }}</option>
        </select>
      </label>
      <label class="campo">
        Natureza
        <select v-model="novaCat.natureza">
          <option value="">—</option>
          <option v-for="(rotulo, valor) in NATUREZAS" :key="valor" :value="valor">{{ rotulo }}</option>
        </select>
      </label>
      <button class="btn primario" :disabled="!novaCat.nome.trim()">Criar</button>
    </form>
  </section>

  <section class="card">
    <h2>
      <span><InfoIcone texto="Classificam as transações na importação e no lançamento (HU-12). A regra vale quando a descrição contém o texto (sem diferença de acento e maiúscula) e, se definidas, a conta e a faixa de valor batem. Vence a de maior prioridade; no empate, a mais específica." />Regras de categorização</span>
    </h2>
    <p v-if="regras.length === 0" class="vazio">Nenhuma regra. Elas também podem ser criadas ao resolver uma pendência.</p>
    <div v-else class="tabela">
      <table>
        <thead>
          <tr>
            <th>Texto</th>
            <th>Categoria / tipo</th>
            <th class="sec">Conta</th>
            <th class="sec">Valor</th>
            <th class="sec">Prioridade</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in regras" :key="r.id" :class="{ inativa: !r.ativa }">
            <td><b>"{{ r.padrao }}"</b></td>
            <td>{{ r.categoriaId ? nomeDaCategoria(r.categoriaId) : '' }}<span v-if="r.tipo" class="chip">{{ TIPOS_DE_TRANSACAO[r.tipo] }}</span></td>
            <td class="sec">{{ nomeDaConta(r.contaId) }}</td>
            <td class="sec num">
              <template v-if="r.valorMinimo || r.valorMaximo">{{ reais(r.valorMinimo ?? '0') }} a {{ r.valorMaximo ? reais(r.valorMaximo) : '…' }}</template>
              <template v-else>qualquer</template>
            </td>
            <td class="sec num">{{ r.prioridade }}</td>
            <td class="acao"><button class="btn discreto" @click="alternarRegra(r)">{{ r.ativa ? 'Desativar' : 'Ativar' }}</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <form class="form" @submit.prevent="criarRegra">
      <label class="campo nome">Se a descrição contém<input v-model="novaRegra.padrao" required minlength="2" maxlength="100" /></label>
      <label class="campo">Categoria<SeletorCategoria v-model="novaRegra.categoriaId" :categorias="categorias" vazio="—" /></label>
      <label class="campo">
        Tipo
        <select v-model="novaRegra.tipo">
          <option value="">pelo sinal</option>
          <option value="transferencia">Transferência</option>
          <option value="pagamento_fatura">Pagamento de fatura</option>
          <option value="receita">Receita</option>
          <option value="despesa">Despesa</option>
        </select>
      </label>
      <label class="campo">
        Conta
        <select v-model="novaRegra.contaId">
          <option value="">qualquer</option>
          <option v-for="c in contas" :key="c.id" :value="c.id">{{ c.instituicao.nome }} · {{ c.nome }}</option>
        </select>
      </label>
      <label class="campo curto">Valor de (R$)<input v-model="novaRegra.valorMinimo" inputmode="decimal" /></label>
      <label class="campo curto">até (R$)<input v-model="novaRegra.valorMaximo" inputmode="decimal" /></label>
      <label class="campo curto">Prioridade<input v-model.number="novaRegra.prioridade" type="number" min="-100" max="100" /></label>
      <button class="btn primario" :disabled="!novaRegra.padrao.trim() || (!novaRegra.categoriaId && !novaRegra.tipo)">Criar regra</button>
    </form>
    <p v-if="erro" class="erro" role="alert">{{ erro }}</p>
  </section>
</template>

<style scoped>
.card {
  margin-top: 16px;
}
.arvore,
.arvore ul {
  list-style: none;
}
.arvore ul {
  padding-left: 20px;
}
.arvore li {
  border-top: 1px solid var(--faint);
}
.item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 0;
  font-size: 14px;
}
.item b {
  font-weight: 600;
}
.item .btn {
  margin-left: auto;
}
.inativa {
  opacity: 0.5;
}
.form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  margin-top: 16px;
}
.nome {
  flex: 1 1 180px;
}
.curto input {
  width: 96px;
}
.tabela {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
th {
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0 12px 8px 0;
}
td {
  padding: 8px 12px 8px 0;
  border-top: 1px solid var(--faint);
}
td .chip {
  margin-left: 6px;
}
.acao {
  text-align: right;
}
.erro {
  margin-top: 12px;
}
@media (max-width: 760px) {
  .sec {
    display: none;
  }
}
</style>
