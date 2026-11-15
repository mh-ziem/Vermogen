import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { type Autor, Escrita } from '../auditoria/escrita.js';
import { CiclosService } from '../calendario/ciclos.service.js';
import { descreverCiclo, somarCiclos } from '../calendario/regras.js';
import { CadastrosService } from '../cadastros/cadastros.service.js';
import { PendenciasService } from '../classificacao/pendencias.service.js';
import { alterar } from '../comum/banco.js';
import { deCentavos } from '../comum/dinheiro.js';
import { ImportacaoService, type LoteListado } from '../importacao/importacao.service.js';
import { type CongelamentoNaApi, ProjecaoService, cicloNaApi, congelamentoNaApi } from '../projecao/projecao.service.js';
import type { Plano } from '../projecao/regras.js';

type StatusDaEntrada = 'aceito' | 'nao_conferido' | 'aguardando';

/**
 * Procedimento de abertura do ciclo (HU-17, UC-01), etapas 1, 2, 4 e 5. Abre sempre o ciclo atual.
 * Congelar é permitido com pendências ou lotes faltando: só fica marcado como incompleto (CA1).
 */
@Injectable()
export class AberturaService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(Escrita) private readonly escrita: Escrita,
    @Inject(CiclosService) private readonly ciclos: CiclosService,
    @Inject(CadastrosService) private readonly cadastros: CadastrosService,
    @Inject(ImportacaoService) private readonly importacao: ImportacaoService,
    @Inject(PendenciasService) private readonly pendencias: PendenciasService,
    @Inject(ProjecaoService) private readonly projecao: ProjecaoService,
  ) {}

  async obter() {
    const reais = await this.ciclos.datasReais();
    const [{ entrada, resultado }, contas, lotes, pendencias] = await Promise.all([
      this.projecao.calcular(),
      this.cadastros.listarContas(false),
      this.importacao.listar({}),
      this.pendencias.listar(),
    ]);
    const ciclo = descreverCiclo(entrada.cicloAtual, reais);
    const anterior = descreverCiclo(somarCiclos(ciclo.id, -1), reais);

    // Etapa 1: os documentos do ciclo anterior. No cartão, a fatura paga neste ciclo.
    const doCiclo = (l: LoteListado, cartao: boolean) =>
      cartao && l.vencimentoDaFatura
        ? ciclo.inicio <= l.vencimentoDaFatura && l.vencimentoDaFatura <= ciclo.fim
        : l.periodo.ate >= anterior.inicio && l.periodo.de <= anterior.fim;
    const entradaDeDados = contas
      .filter((c) => c.instituicao.ativa)
      .map((c) => {
        const daConta = lotes.filter((l) => l.conta.id === c.id && l.status !== 'desfeito' && doCiclo(l, c.tipo === 'cartao'));
        const status: StatusDaEntrada = daConta.some((l) => l.status === 'aceito')
          ? 'aceito'
          : daConta.some((l) => l.status === 'nao_conferido')
            ? 'nao_conferido'
            : 'aguardando';
        return {
          conta: { id: c.id, nome: c.nome, instituicao: c.instituicao.nome, cor: c.instituicao.cor, tipo: c.tipo },
          lotes: daConta,
          status,
        };
      });

    const distribuicao = resultado.ciclos[0]!;
    const [congelado] = await this.db.query(`SELECT * FROM snapshot_projecao WHERE id = $1`, [ciclo.id]);
    return {
      ciclo,
      anterior: anterior.id,
      entrada: entradaDeDados,
      pendencias: {
        semCategoria: pendencias.semCategoria.length,
        possiveisDuplicatas: pendencias.possiveisDuplicatas.length,
        lotesNaoConferidos: pendencias.lotesNaoConferidos.length,
        total: pendencias.total,
      },
      plano: {
        aporte: deCentavos(-distribuicao.aporte),
        orcamentoFlexiveis: deCentavos(distribuicao.orcamentoFlexiveis),
        ajustado: distribuicao.ajustado,
      },
      distribuicao: cicloNaApi(distribuicao),
      folgaMinima: deCentavos(entrada.parametros(ciclo.id).folgaMinima),
      congelamento: congelado ? congelamentoNaApi(congelado) : null,
    };
  }

  /** Etapa 4: ajustar aporte e orçamento de flexíveis do ciclo (CA4). */
  async definirPlano(autor: Autor, plano: Plano) {
    const ciclo = await this.ciclos.atual();
    await this.projecao.definirPlano(autor, ciclo.id, plano);
    return this.obter();
  }

  /** Etapa 5: congela a projeção do ciclo, com a data real (CA2, M-03). Congelar de novo substitui. */
  async congelar(autor: Autor): Promise<CongelamentoNaApi> {
    const [abertura, projecao] = await Promise.all([this.obter(), this.projecao.projecao()]);
    const lotesAceitos = abertura.entrada.filter((e) => e.status === 'aceito').length;
    const incompleto = lotesAceitos < abertura.entrada.length || abertura.pendencias.total > 0;
    const [linha] = await this.escrita.executar(autor, (m) =>
      alterar<Parameters<typeof congelamentoNaApi>[0]>(
        m,
        `INSERT INTO snapshot_projecao (id, incompleto, lotes_aceitos, contas_esperadas, pendencias, resultado_liquido,
           aporte, orcamento_flexiveis, detalhe)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET congelado_em = now(), incompleto = EXCLUDED.incompleto,
           lotes_aceitos = EXCLUDED.lotes_aceitos, contas_esperadas = EXCLUDED.contas_esperadas,
           pendencias = EXCLUDED.pendencias, resultado_liquido = EXCLUDED.resultado_liquido, aporte = EXCLUDED.aporte,
           orcamento_flexiveis = EXCLUDED.orcamento_flexiveis, detalhe = EXCLUDED.detalhe, atualizado_em = now()
         RETURNING *`,
        [
          abertura.ciclo.id,
          incompleto,
          lotesAceitos,
          abertura.entrada.length,
          abertura.pendencias.total,
          abertura.distribuicao.resultadoLiquido,
          abertura.plano.aporte,
          abertura.plano.orcamentoFlexiveis,
          JSON.stringify(projecao),
        ],
      ),
    );
    return congelamentoNaApi(linha!);
  }
}
