<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { chamar, ErroDeApi } from '@/api/http'
import type { Ciclo } from '@/api/tipos'
import AppShell from '@/components/AppShell.vue'
import InfoIcone from '@/components/InfoIcone.vue'
import { ciclo as nomeDoCiclo, data, hoje } from '@/formato'

const ciclos = ref<Ciclo[]>([])
const atual = ref<string>('')
const editando = ref<string | null>(null)
const dataReal = ref('')
const erro = ref('')

function somarMeses(id: string, n: number): string {
  const [a, m] = id.split('-').map(Number) as [number, number]
  const total = a * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

async function carregar() {
  erro.value = ''
  try {
    atual.value = (await chamar<Ciclo>('GET', '/ciclos/atual')).id
    // 2 ciclos anteriores e o horizonte de projeção de 12 ciclos (RN-06).
    ciclos.value = await chamar<Ciclo[]>(
      'GET',
      `/ciclos?de=${somarMeses(atual.value, -2)}&ate=${somarMeses(atual.value, 11)}`,
    )
  } catch {
    erro.value = 'Não foi possível carregar os ciclos.'
  }
}

function editar(c: Ciclo) {
  editando.value = c.id
  dataReal.value = c.salarioReal ?? c.salarioEsperado
  erro.value = ''
}

async function salvar(id: string) {
  try {
    await chamar('PUT', `/ciclos/${id}/salario`, { data: dataReal.value })
    editando.value = null
    await carregar()
  } catch (e) {
    erro.value = e instanceof ErroDeApi ? e.message : 'Não foi possível salvar'
  }
}

async function voltarAoCalculado(id: string) {
  try {
    await chamar('DELETE', `/ciclos/${id}/salario`)
    editando.value = null
    await carregar()
  } catch (e) {
    erro.value = e instanceof ErroDeApi ? e.message : 'Não foi possível salvar'
  }
}

onMounted(carregar)
</script>

<template>
  <AppShell titulo="Configurações" :subtitulo="`hoje ${data(hoje())}`">
    <section class="card">
      <h2>
        <span>
          <InfoIcone
            texto="O ciclo M vai do último dia útil de M−1 até a véspera do último dia útil de M (RN-01); o salário é esperado no início. Se ele entrou em outra data, informe a data real: ela passa a ser o início do ciclo e as transações vão para o ciclo certo (RN-04)."
          />Ciclos financeiros
        </span>
      </h2>
      <div class="tabela">
        <table>
          <thead>
            <tr>
              <th>Ciclo</th>
              <th>Início</th>
              <th>Fim</th>
              <th class="sec">Vale</th>
              <th>Salário real</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in ciclos" :key="c.id" :class="{ atual: c.id === atual }">
              <td>{{ nomeDoCiclo(c.id) }}<span v-if="c.id === atual" class="chip">atual</span></td>
              <td class="num">{{ data(c.inicio) }}</td>
              <td class="num">{{ data(c.fim) }}</td>
              <td class="num sec">{{ data(c.creditoDoVale, true) }}</td>
              <td class="num">
                <template v-if="editando === c.id">
                  <input v-model="dataReal" type="date" class="data" aria-label="Data real do salário" />
                </template>
                <template v-else-if="c.salarioReal">
                  {{ data(c.salarioReal) }} <span class="chip real">informada</span>
                </template>
                <span v-else class="calculada">—</span>
              </td>
              <td class="acoes">
                <template v-if="editando === c.id">
                  <button class="btn primario" @click="salvar(c.id)">Salvar</button>
                  <button v-if="c.salarioReal" class="btn" @click="voltarAoCalculado(c.id)">Usar calculada</button>
                  <button class="btn" @click="editando = null">Cancelar</button>
                </template>
                <button v-else class="btn discreto" @click="editar(c)">Data real</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="erro" class="erro" role="alert">{{ erro }}</p>
    </section>
  </AppShell>
</template>

<style scoped>
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
  padding: 9px 12px 9px 0;
  border-top: 1px solid var(--faint);
  white-space: nowrap;
}
tr.atual td {
  color: var(--text);
  font-weight: 600;
}
.chip {
  margin-left: 8px;
}
.calculada {
  color: var(--muted);
}
.chip.real {
  background: rgba(254, 206, 76, 0.13);
  color: var(--pending);
}
.acoes {
  text-align: right;
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}
.data {
  background: var(--recess);
  border: 1px solid var(--faint);
  border-radius: 8px;
  padding: 5px 8px;
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
