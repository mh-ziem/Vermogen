<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { chamar, ErroDeApi } from '@/api/http'
import type { FixaConfigurada, Parametros } from '@/api/tipos'
import InfoIcone from '@/components/InfoIcone.vue'
import { cicloCurto, dinheiroDigitado, percentualDigitado } from '@/components/projecao/formato'
import { paraCampo, reais } from '@/formato'

/** Parâmetros da projeção (salário, aporte, flexíveis, folga mínima) e valores fixos das intermitentes (RN-10). */
const parametros = ref<Parametros | null>(null)
const campos = ref({ salario: '', aporte: '', orcamento: '', folga: '' })
const aviso = ref('')
const erro = ref('')
const salvando = ref(false)

const fixas = ref<FixaConfigurada[]>([])
const valoresFixos = ref<Record<string, string>>({})
const erroDasFixas = ref('')

function mensagem(e: unknown) {
  return e instanceof ErroDeApi ? e.message : 'Não foi possível concluir'
}

function preencher(p: Parametros) {
  parametros.value = p
  campos.value = {
    salario: p.salario ? paraCampo(p.salario) : '',
    aporte: String(p.aportePercentual).replace('.', ','),
    orcamento: paraCampo(p.orcamentoFlexiveis),
    folga: paraCampo(p.folgaMinima),
  }
}

function preencherFixas(lista: FixaConfigurada[]) {
  fixas.value = lista
  valoresFixos.value = Object.fromEntries(lista.map((f) => [f.categoria.id, f.valorFixo ? paraCampo(f.valorFixo) : '']))
}

async function carregar() {
  const [p, f] = await Promise.allSettled([
    chamar<Parametros>('GET', '/parametros'),
    chamar<FixaConfigurada[]>('GET', '/fixas'),
  ])
  if (p.status === 'fulfilled') preencher(p.value)
  else erro.value = mensagem(p.reason)
  if (f.status === 'fulfilled') preencherFixas(f.value)
  else erroDasFixas.value = mensagem(f.reason)
}

/** Monta o corpo só com o que mudou; devolve uma mensagem se algum campo for inválido. */
function mudancas(p: Parametros): { corpo: Record<string, string | number> } | { invalido: string } {
  const corpo: Record<string, string | number> = {}
  const c = campos.value
  if (c.salario.trim()) {
    const v = dinheiroDigitado(c.salario)
    if (!v || Number(v) === 0) return { invalido: 'Salário inválido, ex.: 4600,00' }
    if (p.salario === null || Number(v) !== Number(p.salario)) corpo.salario = v
  } else if (p.salario !== null) {
    return { invalido: 'Informe o salário' }
  }
  const aporte = percentualDigitado(c.aporte)
  if (aporte === null) return { invalido: 'Aporte inválido: percentual de 0 a 100, ex.: 10' }
  if (aporte !== p.aportePercentual) corpo.aportePercentual = aporte
  const orcamento = dinheiroDigitado(c.orcamento)
  if (orcamento === null) return { invalido: 'Orçamento de flexíveis inválido, ex.: 1420,00' }
  if (Number(orcamento) !== Number(p.orcamentoFlexiveis)) corpo.orcamentoFlexiveis = orcamento
  const folga = dinheiroDigitado(c.folga)
  if (folga === null) return { invalido: 'Folga mínima inválida, ex.: 300,00' }
  if (Number(folga) !== Number(p.folgaMinima)) corpo.folgaMinima = folga
  return { corpo }
}

async function salvar() {
  const p = parametros.value
  if (!p) return
  erro.value = ''
  aviso.value = ''
  const m = mudancas(p)
  if ('invalido' in m) {
    erro.value = m.invalido
    return
  }
  if (Object.keys(m.corpo).length === 0) {
    aviso.value = 'Sem alterações'
    return
  }
  salvando.value = true
  try {
    preencher(await chamar<Parametros>('PUT', '/parametros', m.corpo))
    aviso.value = 'Salvo'
  } catch (e) {
    erro.value = mensagem(e)
  } finally {
    salvando.value = false
  }
}

async function salvarFixa(f: FixaConfigurada) {
  erroDasFixas.value = ''
  const texto = (valoresFixos.value[f.categoria.id] ?? '').trim()
  let valor: string | null = null
  if (texto) {
    valor = dinheiroDigitado(texto)
    if (valor === null) {
      erroDasFixas.value = 'Valor inválido: use um valor positivo, ex.: 186,00'
      return
    }
    if (f.valorFixo !== null && Number(valor) === Number(f.valorFixo)) return
  } else if (f.valorFixo === null) {
    return
  }
  try {
    const nova = await chamar<FixaConfigurada>('PUT', `/fixas/${f.categoria.id}`, { valor })
    preencherFixas(fixas.value.map((x) => (x.categoria.id === nova.categoria.id ? nova : x)))
  } catch (e) {
    erroDasFixas.value = mensagem(e)
  }
}

async function usarMaiorDos3(f: FixaConfigurada) {
  valoresFixos.value[f.categoria.id] = ''
  await salvarFixa(f)
}

onMounted(carregar)
</script>

<template>
  <div class="parametros">
    <section class="card">
      <h2>
        <span>
          <InfoIcone
            texto="Base da projeção dos 12 ciclos. Salário líquido mensal: o dízimo é 10% dele (RN-07). Aporte: percentual do salário investido a cada ciclo. Orçamento de flexíveis: quanto se pode gastar por ciclo no que não é fixo (pago no ciclo seguinte, pelas faturas). Folga mínima: o líquido projetado a partir do qual o veredito é Positivo (RN-16). A mudança vale a partir do ciclo atual; ciclos passados e projeções já congeladas não mudam."
          />Parâmetros da projeção
        </span>
      </h2>
      <form v-if="parametros" class="form" @submit.prevent="salvar">
        <label class="campo">Salário líquido (R$)<input v-model="campos.salario" inputmode="decimal" placeholder="4600,00" /></label>
        <label class="campo curto">Aporte (%)<input v-model="campos.aporte" inputmode="decimal" /></label>
        <label class="campo">Orçamento de flexíveis (R$)<input v-model="campos.orcamento" inputmode="decimal" /></label>
        <label class="campo">Folga mínima (R$)<input v-model="campos.folga" inputmode="decimal" /></label>
        <button class="btn primario" :disabled="salvando">Salvar</button>
        <span v-if="aviso" class="aviso" role="status">{{ aviso }}</span>
      </form>
      <p v-if="erro" class="erro" role="alert">{{ erro }}</p>
    </section>

    <section class="card">
      <h2>
        <span>
          <InfoIcone
            texto="Categorias de natureza intermitente (luz, internet, telefonia). A projeção usa o maior valor dos últimos 3 ciclos (postura conservadora); se você informar um valor fixo, ele prevalece. Deixe vazio para voltar ao cálculo (RN-10)."
          />Fixas e intermitentes
        </span>
      </h2>
      <p v-if="fixas.length === 0" class="vazio">
        Nenhuma categoria intermitente. A natureza "intermitente" se define em Categorias, abaixo.
      </p>
      <div v-else class="tabela">
        <table>
          <thead>
            <tr>
              <th>Categoria</th>
              <th class="sec">Últimos 3 ciclos</th>
              <th class="r">Maior dos 3</th>
              <th class="r">Valor fixo</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in fixas" :key="f.categoria.id">
              <td>{{ f.categoria.pai ? `${f.categoria.pai} · ` : '' }}{{ f.categoria.nome }}</td>
              <td class="sec hist num">
                <span v-for="h in f.historico" :key="h.ciclo"><i>{{ cicloCurto(h.ciclo) }}</i> {{ reais(h.valor) }}</span>
                <template v-if="f.historico.length === 0">—</template>
              </td>
              <td class="r num" :class="{ apagado: f.valorFixo !== null }">{{ reais(f.maiorDos3) }}</td>
              <td class="r fixo">
                <input
                  v-model="valoresFixos[f.categoria.id]"
                  class="num"
                  inputmode="decimal"
                  :placeholder="paraCampo(f.maiorDos3)"
                  :aria-label="`Valor fixo de ${f.categoria.nome} (R$)`"
                  @change="salvarFixa(f)"
                />
                <button
                  v-if="f.valorFixo !== null"
                  type="button"
                  class="btn discreto"
                  title="Usar o maior dos 3"
                  @click="usarMaiorDos3(f)"
                >
                  Usar maior
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="erroDasFixas" class="erro" role="alert">{{ erroDasFixas }}</p>
    </section>
  </div>
</template>

<style scoped>
.card {
  margin-top: 16px;
}
.form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
}
.form .campo input {
  width: 150px;
  text-align: right;
}
.form .curto input {
  width: 80px;
}
.aviso {
  font-size: 13px;
  color: var(--muted);
  padding-bottom: 10px;
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
  white-space: nowrap;
}
th.r,
td.r {
  text-align: right;
}
td {
  padding: 8px 12px 8px 0;
  border-top: 1px solid var(--faint);
}
th:last-child,
td:last-child {
  padding-right: 0;
}
.hist {
  font-size: 12.5px;
  color: var(--muted);
}
.hist span {
  white-space: nowrap;
}
.hist span + span {
  margin-left: 12px;
}
.hist i {
  font-style: normal;
  opacity: 0.7;
}
.apagado {
  color: var(--muted);
}
.fixo {
  white-space: nowrap;
}
.fixo input {
  width: 110px;
  text-align: right;
  background: var(--recess);
  border: 1px solid var(--faint);
  border-radius: 9px;
  padding: 7px 9px;
  font-size: 13px;
  color: var(--text);
}
.erro {
  margin-top: 12px;
}
@media (max-width: 760px) {
  .sec {
    display: none;
  }
  .form .campo {
    flex: 1 1 140px;
  }
  .form .campo input {
    width: 100%;
  }
  .fixo input {
    width: 96px;
    font-size: 16px;
  }
}
</style>
