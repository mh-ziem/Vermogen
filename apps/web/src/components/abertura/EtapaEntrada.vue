<script setup lang="ts">
import { computed } from 'vue'
import type { Abertura, StatusDaEntrada } from '@/api/tipos'
import InfoIcone from '@/components/InfoIcone.vue'
import { ciclo as nomeDoCiclo, reais } from '@/formato'

const props = defineProps<{ abertura: Abertura }>()

const STATUS: Record<StatusDaEntrada, { rotulo: string; classe: string }> = {
  aceito: { rotulo: 'Aceito', classe: 'ok' },
  nao_conferido: { rotulo: 'Não conferido', classe: 'warn' },
  aguardando: { rotulo: 'Aguardando', classe: '' },
}

/** Lotes desfeitos não contam: o documento precisa ser lançado de novo. */
const linhas = computed(() =>
  props.abertura.entrada.map((e) => ({ ...e, lotes: e.lotes.filter((l) => l.status !== 'desfeito') })),
)

const sigla = (nome: string) => nome.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase()
</script>

<template>
  <section class="card">
    <h2>
      <span>
        <InfoIcone
          texto="Documentos esperados para o ciclo anterior, um por conta. Você envia os documentos ao Claude, que lança cada um como lote. Aceito: a soma bateu com o total do documento. Não conferido: o documento não tinha total; confira em Pendências. Aguardando: nenhum documento lançado."
        />Entrada de dados · ciclo {{ nomeDoCiclo(abertura.anterior) }}
      </span>
      <span class="grow"></span>
      <span class="chip mcp">Via Claude (MCP)</span>
    </h2>
    <p v-if="linhas.length === 0" class="vazio">Nenhuma conta ativa.</p>
    <div v-else class="tabela">
      <table class="entrada">
        <thead>
          <tr>
            <th>Conta</th>
            <th>Documento</th>
            <th class="r">Transações</th>
            <th class="r">Total conferido</th>
            <th class="r">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in linhas" :key="e.conta.id" class="bk" :style="{ '--bk': e.conta.cor }">
            <td>
              <span class="ico" aria-hidden="true">{{ sigla(e.conta.instituicao) }}</span>{{ e.conta.instituicao }} · {{ e.conta.nome }}
            </td>
            <td class="m">
              <template v-if="e.lotes.length">
                <span v-for="l in e.lotes" :key="l.id" class="linha-lote">{{ l.documento }}</span>
              </template>
              <template v-else>—</template>
            </td>
            <td class="r num">
              <template v-if="e.lotes.length">
                <span v-for="l in e.lotes" :key="l.id" class="linha-lote">{{ l.itens }}</span>
              </template>
              <template v-else>—</template>
            </td>
            <td class="r">
              <template v-if="e.lotes.length">
                <span v-for="l in e.lotes" :key="l.id" class="linha-lote">
                  <template v-if="l.total"><span class="num">{{ reais(l.total) }}</span><span v-if="l.status === 'aceito'" class="pos"> ✓</span></template>
                  <template v-else-if="l.saldoFinal"><span class="num">saldo {{ reais(l.saldoFinal) }}</span><span v-if="l.status === 'aceito'" class="pos"> ✓</span></template>
                  <span v-else class="m">sem total</span>
                </span>
              </template>
              <span v-else class="m">—</span>
            </td>
            <td class="r">
              <span class="chip" :class="STATUS[e.status].classe">{{ STATUS[e.status].rotulo }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="toolbar">
      <RouterLink class="btn" :to="{ name: 'transacoes' }">+ Lançamento manual</RouterLink>
    </div>
  </section>
</template>

<style scoped src="../projecao/comum.css"></style>
<style scoped>
.ico {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--elev);
  display: inline-grid;
  place-items: center;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--muted);
  margin-right: 10px;
  vertical-align: middle;
}
.linha-lote {
  display: block;
}
.linha-lote + .linha-lote {
  margin-top: 4px;
}
.toolbar {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}
.toolbar .btn {
  text-decoration: none;
  background: transparent;
  color: var(--muted);
  border: 1px solid var(--faint);
}
@media (max-width: 760px) {
  .entrada td:nth-child(2),
  .entrada td:nth-child(3),
  .entrada th:nth-child(2),
  .entrada th:nth-child(3),
  .ico {
    display: none;
  }
}
</style>
