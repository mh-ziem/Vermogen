<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { chamar, ErroDeApi } from '@/api/http'
import type { Projecao } from '@/api/tipos'
import AppShell from '@/components/AppShell.vue'
import InfoIcone from '@/components/InfoIcone.vue'
import DetalheCiclo from '@/components/projecao/DetalheCiclo.vue'
import { VEREDITOS } from '@/components/projecao/formato'
import { ciclo as nomeDoCiclo, data, reais } from '@/formato'

/** Projeção dos próximos 12 ciclos (UC-04, HU-15). */
const projecao = ref<Projecao | null>(null)
const aberto = ref<string | null>(null)
const erro = ref('')

async function carregar() {
  erro.value = ''
  try {
    projecao.value = await chamar<Projecao>('GET', '/projecao')
  } catch (e) {
    erro.value = e instanceof ErroDeApi ? e.message : 'Não foi possível carregar a projeção'
  }
}

function alternar(id: string) {
  aberto.value = aberto.value === id ? null : id
}

const negativo = (v: string) => Number(v) < 0

onMounted(carregar)
</script>

<template>
  <AppShell titulo="Projeção" :subtitulo="projecao?.ultimosDados ? `dados até ${data(projecao.ultimosDados, true)}` : ''">
    <p v-if="erro" class="erro bloco" role="alert">{{ erro }}</p>

    <section v-if="projecao && !projecao.configurada" class="card">
      <h2>
        <span><InfoIcone texto="A projeção parte do salário líquido mensal: dízimo, aporte e veredito dependem dele." />Projeção</span>
      </h2>
      <p class="vazio">Salário líquido não informado.</p>
      <RouterLink class="btn primario" :to="{ name: 'configuracoes' }">Informar em Configurações</RouterLink>
    </section>

    <section v-else-if="projecao" class="card">
      <h2>
        <span>
          <InfoIcone
            texto="Próximos 12 ciclos (RN-06). Resultado líquido = receita − dízimo − faturas − fixas − aporte (HU-15). As faturas incluem parcelas, recorrentes do cartão e o orçamento de flexíveis do ciclo anterior (RN-11); fixas e intermitentes usam o maior dos últimos 3 ciclos (RN-10). Clique num ciclo para ver os itens."
          />Próximos 12 ciclos
        </span>
      </h2>
      <div class="tabela">
        <table class="projecao">
          <thead>
            <tr>
              <th>Ciclo</th>
              <th class="r">Receita</th>
              <th class="r sec">Dízimo</th>
              <th class="r">Faturas</th>
              <th class="r sec">Fixas</th>
              <th class="r sec">Aporte</th>
              <th class="r">Líquido</th>
              <th class="r">Veredito</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="c in projecao.ciclos" :key="c.ciclo.id">
              <tr
                class="click linha-ciclo"
                :class="{ open: aberto === c.ciclo.id, atual: c.ciclo.id === projecao.cicloAtual }"
                tabindex="0"
                :aria-expanded="aberto === c.ciclo.id"
                @click="alternar(c.ciclo.id)"
                @keydown.enter="alternar(c.ciclo.id)"
              >
                <td>
                  <span class="nome">{{ nomeDoCiclo(c.ciclo.id) }}</span>
                  <span class="periodo num">{{ data(c.ciclo.inicio, true) }} – {{ data(c.ciclo.fim, true) }}</span>
                  <span v-if="c.ajustado" class="chip aj">ajustado</span>
                </td>
                <td class="r num">{{ reais(c.receita) }}</td>
                <td class="r num sec">{{ reais(c.dizimo) }}</td>
                <td class="r num">{{ reais(c.totais.faturas) }}</td>
                <td class="r num sec">{{ reais(c.totais.fixas) }}</td>
                <td class="r num sec">{{ reais(c.aporte) }}</td>
                <td class="r num liquido" :class="negativo(c.resultadoLiquido) ? 'neg' : 'pos'">{{ reais(c.resultadoLiquido) }}</td>
                <td class="r">
                  <span class="chip" :class="VEREDITOS[c.veredito].classe">{{ VEREDITOS[c.veredito].rotulo }}</span>
                </td>
              </tr>
              <tr v-if="aberto === c.ciclo.id" class="det">
                <td colspan="8"><DetalheCiclo :ciclo="c" /></td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>
  </AppShell>
</template>

<style scoped src="../components/projecao/comum.css"></style>
<style scoped>
.bloco {
  margin-bottom: 16px;
}
.vazio {
  margin-bottom: 12px;
}
.card .btn {
  display: inline-block;
  text-decoration: none;
}
td {
  white-space: nowrap;
}
.nome {
  font-weight: 600;
}
.periodo {
  margin-left: 8px;
  font-size: 12px;
  color: var(--muted);
}
.aj {
  margin-left: 8px;
}
tr.atual .nome {
  color: var(--accent);
}
.liquido {
  font-weight: 600;
}
tr.det > td {
  white-space: normal;
}

/* DS-10: no celular, saem as colunas secundárias. */
@media (max-width: 760px) {
  .sec {
    display: none;
  }
  .periodo {
    display: block;
    margin-left: 0;
  }
  .aj {
    display: none;
  }
}
</style>
