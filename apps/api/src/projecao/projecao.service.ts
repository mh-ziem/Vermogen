import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { type Autor, Escrita } from '../auditoria/escrita.js';
import { type Data, hoje } from '../calendario/datas.js';
import { CiclosService } from '../calendario/ciclos.service.js';
import { type Ciclo, type DatasReais, type IdCiclo, cicloDaData, descreverCiclo, somarCiclos } from '../calendario/regras.js';
import { CadastrosService } from '../cadastros/cadastros.service.js';
import type { TipoDeTransacao } from '../classificacao/regras.js';
import { centavosDoBanco, deCentavos } from '../comum/dinheiro.js';
import {
  type Cartao,
  type CicloProjetado,
  type Item,
  type Movimento,
  type Natureza,
  type ParcelaGravada,
  type Parametros,
  type Plano,
  type ResultadoDaProjecao,
  projetar,
} from './regras.js';

/** RN-06: horizonte de 12 ciclos. */
export const HORIZONTE = 12;

/** Valores iniciais enquanto você não muda nada (PRD §9.4, RN-16; DM-26). */
export const PARAMETROS_INICIAIS: Parametros = {
  salario: null,
  aportePercentual: 10,
  orcamentoFlexiveis: 142000,
  folgaMinima: 30000,
};

const NOME_DO_PARAMETRO = {
  salario: 'salario',
  aportePercentual: 'aporte_percentual',
  orcamentoFlexiveis: 'orcamento_flexiveis',
  folgaMinima: 'folga_minima',
} as const;
type ChaveDoParametro = keyof typeof NOME_DO_PARAMETRO;

// ----- Formatos da API (apps/web/src/api/tipos.ts) --------------------------------------

export interface ParametrosNaApi {
  salario: string | null;
  aportePercentual: number;
  orcamentoFlexiveis: string;
  folgaMinima: string;
}

export interface CongelamentoNaApi {
  ciclo: string;
  congeladaEm: string;
  incompleta: boolean;
  lotesAceitos: number;
  contasEsperadas: number;
  pendencias: number;
  resultadoLiquido: string;
  aporte: string;
  orcamentoFlexiveis: string;
}

const item = (i: Item) => ({ descricao: i.descricao, valor: deCentavos(i.centavos), origem: i.origem });

export function cicloNaApi(c: CicloProjetado) {
  return {
    ciclo: c.ciclo,
    receita: deCentavos(c.receita),
    dizimo: deCentavos(c.dizimo),
    faturas: c.faturas.map((f) => ({
      conta: { id: f.cartao.id, nome: f.cartao.nome, instituicao: f.cartao.instituicao, cor: f.cartao.cor },
      fechamento: f.fechamento,
      vencimento: f.vencimento,
      status: f.status,
      valor: deCentavos(f.centavos),
      realizado: deCentavos(f.realizado),
      itens: f.itens.map(item),
    })),
    flexiveisNosCartoes: {
      valor: deCentavos(c.flexiveisNosCartoes.centavos),
      orcamentoDoCicloAnterior: deCentavos(c.flexiveisNosCartoes.orcamentoDoCicloAnterior),
      gastoNoCicloAnterior: deCentavos(c.flexiveisNosCartoes.gastoNoCicloAnterior),
    },
    fixas: c.fixas.map((f) => ({
      descricao: f.descricao,
      categoriaId: f.categoriaId,
      valor: deCentavos(f.centavos),
      base: f.base,
      historico: f.historico.map((h) => ({ ciclo: h.ciclo, valor: deCentavos(h.centavos) })),
    })),
    totais: { faturas: deCentavos(c.totais.faturas), fixas: deCentavos(c.totais.fixas) },
    aporte: deCentavos(c.aporte),
    aportePercentual: c.aportePercentual,
    orcamentoFlexiveis: deCentavos(c.orcamentoFlexiveis),
    resultadoLiquido: deCentavos(c.resultadoLiquido),
    veredito: c.veredito,
    ajustado: c.ajustado,
  };
}
export type CicloNaApi = ReturnType<typeof cicloNaApi>;

function parametrosNaApi(p: Parametros): ParametrosNaApi {
  return {
    salario: p.salario === null ? null : deCentavos(p.salario),
    aportePercentual: p.aportePercentual,
    orcamentoFlexiveis: deCentavos(p.orcamentoFlexiveis),
    folgaMinima: deCentavos(p.folgaMinima),
  };
}

export function congelamentoNaApi(l: {
  id: string;
  congelado_em: Date;
  incompleto: boolean;
  lotes_aceitos: number;
  contas_esperadas: number;
  pendencias: number;
  resultado_liquido: string;
  aporte: string;
  orcamento_flexiveis: string;
}): CongelamentoNaApi {
  return {
    ciclo: l.id,
    congeladaEm: new Date(l.congelado_em).toISOString(),
    incompleta: l.incompleto,
    lotesAceitos: l.lotes_aceitos,
    contasEsperadas: l.contas_esperadas,
    pendencias: l.pendencias,
    resultadoLiquido: deCentavos(centavosDoBanco(l.resultado_liquido)!),
    aporte: deCentavos(centavosDoBanco(l.aporte)!),
    orcamentoFlexiveis: deCentavos(centavosDoBanco(l.orcamento_flexiveis)!),
  };
}

interface LinhaMovimento {
  conta_id: string | null;
  cartao: boolean | null;
  fatura_id: string | null;
  data_compra: string;
  data_pagamento: string;
  valor: string;
  tipo: TipoDeTransacao;
  compensa: boolean;
  categoria_id: string | null;
  categoria_nome: string | null;
  natureza: Natureza | null;
  parcela_numero: number | null;
  parcela_total: number | null;
  descricao: string;
}

/** Projeção (HU-15): lê o banco, chama a regra pura e formata para a API. */
@Injectable()
export class ProjecaoService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(Escrita) private readonly escrita: Escrita,
    @Inject(CiclosService) private readonly ciclos: CiclosService,
    @Inject(CadastrosService) private readonly cadastros: CadastrosService,
  ) {}

  // ----- Parâmetros com vigência por ciclo (DM-26) -----------------------------------

  private async lerParametros(): Promise<(ciclo: IdCiclo) => Parametros> {
    const linhas: { nome: string; a_partir_de: string; valor: string }[] = await this.db.query(
      `SELECT nome, a_partir_de, valor FROM parametro ORDER BY a_partir_de`,
    );
    return (ciclo) => {
      const p: Parametros = { ...PARAMETROS_INICIAIS };
      for (const l of linhas) {
        if (l.a_partir_de > ciclo) continue;
        const centavos = centavosDoBanco(l.valor)!;
        if (l.nome === 'salario') p.salario = centavos;
        if (l.nome === 'aporte_percentual') p.aportePercentual = centavos / 100;
        if (l.nome === 'orcamento_flexiveis') p.orcamentoFlexiveis = centavos;
        if (l.nome === 'folga_minima') p.folgaMinima = centavos;
      }
      return p;
    };
  }

  async parametros(): Promise<ParametrosNaApi> {
    const ciclo = await this.cicloAtual();
    return parametrosNaApi((await this.lerParametros())(ciclo.id));
  }

  /** Muda os parâmetros a partir do ciclo atual; os ciclos anteriores não mudam. */
  async definirParametros(autor: Autor, dados: Partial<Record<ChaveDoParametro, number>>): Promise<ParametrosNaApi> {
    const ciclo = (await this.cicloAtual()).id;
    await this.escrita.executar(autor, async (m) => {
      for (const [chave, valor] of Object.entries(dados) as [ChaveDoParametro, number][]) {
        const emReais = chave === 'aportePercentual' ? valor.toFixed(2) : deCentavos(valor);
        await m.query(
          `INSERT INTO parametro (nome, a_partir_de, valor) VALUES ($1, $2, $3)
           ON CONFLICT (nome, a_partir_de) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()`,
          [NOME_DO_PARAMETRO[chave], ciclo, emReais],
        );
      }
    });
    return this.parametros();
  }

  // ----- Valor fixo das intermitentes (RN-10) ------------------------------------------

  private async intermitentes(): Promise<{ id: string; nome: string; pai: string | null }[]> {
    return this.db.query(
      `SELECT c.id, c.nome, p.nome AS pai FROM categoria c LEFT JOIN categoria p ON p.id = c.pai_id
        WHERE c.ativa AND coalesce(c.natureza, p.natureza) = 'intermitente'
        ORDER BY lower(coalesce(p.nome, c.nome)), c.pai_id IS NOT NULL, lower(c.nome)`,
    );
  }

  async fixas() {
    const { entrada, resultado } = await this.calcular();
    const atual = resultado.ciclos[0]!;
    const fixos = await this.db.query(`SELECT categoria_id, a_partir_de, valor FROM orcamento`);
    return (await this.intermitentes()).map((cat) => {
      const vigente = (fixos as { categoria_id: string; a_partir_de: string; valor: string | null }[])
        .filter((f) => f.categoria_id === cat.id && f.a_partir_de <= entrada.cicloAtual)
        .sort((a, b) => (a.a_partir_de < b.a_partir_de ? 1 : -1))[0];
      const linha = atual.fixas.find((f) => f.categoriaId === cat.id);
      const historico =
        linha?.historico ?? [3, 2, 1].map((n) => ({ ciclo: somarCiclos(entrada.cicloAtual, -n), centavos: 0 }));
      return {
        categoria: cat,
        maiorDos3: deCentavos(Math.max(0, ...historico.map((h) => h.centavos))),
        historico: historico.map((h) => ({ ciclo: h.ciclo, valor: deCentavos(h.centavos) })),
        valorFixo: vigente?.valor ? deCentavos(centavosDoBanco(vigente.valor)!) : null,
      };
    });
  }

  /** Fixa o valor de uma intermitente a partir do ciclo atual; null volta ao cálculo. */
  async definirFixa(autor: Autor, categoriaId: string, centavos: number | null) {
    if (!(await this.intermitentes()).some((c) => c.id === categoriaId)) {
      const [existe] = await this.db.query(`SELECT 1 FROM categoria WHERE id = $1`, [categoriaId]);
      if (!existe) throw new NotFoundException('Categoria não encontrada');
      throw new BadRequestException('Só categoria intermitente (ativa) tem valor fixo (RN-10)');
    }
    const ciclo = (await this.cicloAtual()).id;
    await this.escrita.executar(autor, (m) =>
      m.query(
        `INSERT INTO orcamento (categoria_id, a_partir_de, valor) VALUES ($1, $2, $3)
         ON CONFLICT (categoria_id, a_partir_de) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()`,
        [categoriaId, ciclo, centavos === null ? null : deCentavos(centavos)],
      ),
    );
    return (await this.fixas()).find((f) => f.categoria.id === categoriaId)!;
  }

  // ----- Plano do ciclo (abertura, HU-17 CA4) -------------------------------------------

  async definirPlano(autor: Autor, ciclo: IdCiclo, plano: Plano): Promise<void> {
    await this.escrita.executar(autor, (m) =>
      m.query(
        `INSERT INTO plano_ciclo (id, aporte, orcamento_flexiveis) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET aporte = EXCLUDED.aporte, orcamento_flexiveis = EXCLUDED.orcamento_flexiveis,
           atualizado_em = now()`,
        [ciclo, deCentavos(plano.aporte), deCentavos(plano.orcamentoFlexiveis)],
      ),
    );
  }

  // ----- Cálculo ----------------------------------------------------------------------

  async cicloAtual(): Promise<Ciclo> {
    return this.ciclos.atual();
  }

  async calcular(dia: Data = hoje()) {
    const reais: DatasReais = await this.ciclos.datasReais();
    const cicloAtual = cicloDaData(dia, reais);
    const de = descreverCiclo(somarCiclos(cicloAtual, -3), reais).inicio;
    const ate = descreverCiclo(somarCiclos(cicloAtual, HORIZONTE - 1), reais).fim;

    const [parametros, planos, contas, faturas, movimentos, parcelas, intermitentes, valoresFixos] = await Promise.all([
      this.lerParametros(),
      this.db.query(`SELECT id, aporte, orcamento_flexiveis FROM plano_ciclo`),
      this.cadastros.listarContas(false),
      this.db.query(
        `SELECT id, conta_id, to_char(fechamento, 'YYYY-MM-DD') AS fechamento, to_char(vencimento, 'YYYY-MM-DD') AS vencimento
           FROM fatura WHERE vencimento BETWEEN $1 AND $2`,
        [de, ate],
      ),
      this.db.query(
        `SELECT t.conta_id, c.tipo = 'cartao' AS cartao, t.fatura_id,
                to_char(t.data_compra, 'YYYY-MM-DD') AS data_compra, to_char(t.data_pagamento, 'YYYY-MM-DD') AS data_pagamento,
                t.valor, t.tipo, (t.tipo = 'receita_fora_das_contas' AND t.compensa_id IS NOT NULL) AS compensa,
                cat.id AS categoria_id, cat.nome AS categoria_nome, coalesce(cat.natureza, pai.natureza) AS natureza,
                t.parcela_numero, t.parcela_total, coalesce(t.descricao, t.descricao_original) AS descricao
           FROM transacao t
           LEFT JOIN conta c ON c.id = t.conta_id
           LEFT JOIN transacao comp ON comp.id = t.compensa_id AND t.tipo = 'receita_fora_das_contas'
           LEFT JOIN categoria cat ON cat.id = coalesce(t.categoria_id, comp.categoria_id)
           LEFT JOIN categoria pai ON pai.id = cat.pai_id
          WHERE t.deleted_at IS NULL AND (t.data_pagamento BETWEEN $1 AND $2 OR t.data_compra BETWEEN $1 AND $2)`,
        [de, ate],
      ),
      this.db.query(
        `SELECT t.conta_id, c.tipo, c.dia_fechamento, c.dia_vencimento, to_char(f.fechamento, 'YYYY-MM-DD') AS fechamento,
                to_char(t.data_pagamento, 'YYYY-MM-DD') AS data_pagamento, t.valor, t.parcela_numero, t.parcela_total,
                t.descricao_original
           FROM transacao t JOIN conta c ON c.id = t.conta_id LEFT JOIN fatura f ON f.id = t.fatura_id
          WHERE t.deleted_at IS NULL AND t.parcela_total IS NOT NULL AND t.tipo = 'despesa'`,
      ),
      this.intermitentes(),
      this.db.query(`SELECT categoria_id, a_partir_de, valor FROM orcamento`),
    ]);

    const cartoes: Cartao[] = contas
      .filter((c) => c.tipo === 'cartao' && c.cartao && c.instituicao.ativa)
      .map((c) => ({
        id: c.id,
        nome: c.nome,
        instituicao: c.instituicao.nome,
        cor: c.instituicao.cor,
        dias: { diaFechamento: c.cartao!.diaFechamento, diaVencimento: c.cartao!.diaVencimento },
      }));

    const entrada = {
      hoje: dia,
      reais,
      cicloAtual,
      horizonte: HORIZONTE,
      parametros,
      planos: new Map<IdCiclo, Plano>(
        (planos as { id: string; aporte: string; orcamento_flexiveis: string }[]).map((p) => [
          p.id,
          { aporte: centavosDoBanco(p.aporte)!, orcamentoFlexiveis: centavosDoBanco(p.orcamento_flexiveis)! },
        ]),
      ),
      cartoes,
      faturas: (faturas as { id: string; conta_id: string; fechamento: string; vencimento: string }[]).map((f) => ({
        id: f.id,
        contaId: f.conta_id,
        fechamento: f.fechamento,
        vencimento: f.vencimento,
      })),
      movimentos: (movimentos as LinhaMovimento[]).map(
        (l): Movimento => ({
          contaId: l.conta_id,
          cartao: l.cartao === true,
          faturaId: l.fatura_id,
          dataCompra: l.data_compra,
          dataPagamento: l.data_pagamento,
          centavos: centavosDoBanco(l.valor)!,
          tipo: l.tipo,
          compensa: l.compensa,
          categoriaId: l.categoria_id,
          categoriaNome: l.categoria_nome,
          natureza: l.natureza,
          parcela: l.parcela_numero ? { numero: l.parcela_numero, total: l.parcela_total! } : null,
          descricao: l.descricao,
        }),
      ),
      parcelas: (
        parcelas as {
          conta_id: string;
          tipo: string;
          dia_fechamento: number | null;
          dia_vencimento: number | null;
          fechamento: string | null;
          data_pagamento: string;
          valor: string;
          parcela_numero: number;
          parcela_total: number;
          descricao_original: string;
        }[]
      ).map(
        (l): ParcelaGravada => ({
          contaId: l.conta_id,
          cartao:
            l.tipo === 'cartao' && l.dia_fechamento && l.dia_vencimento
              ? { diaFechamento: l.dia_fechamento, diaVencimento: l.dia_vencimento }
              : null,
          fechamento: l.fechamento,
          dataPagamento: l.data_pagamento,
          centavos: centavosDoBanco(l.valor)!,
          numero: l.parcela_numero,
          total: l.parcela_total,
          descricao: l.descricao_original,
        }),
      ),
      intermitentes,
      valoresFixos: (valoresFixos as { categoria_id: string; a_partir_de: string; valor: string | null }[]).map((v) => ({
        categoriaId: v.categoria_id,
        aPartirDe: v.a_partir_de,
        centavos: centavosDoBanco(v.valor),
      })),
    };
    const resultado: ResultadoDaProjecao = projetar(entrada);
    return { entrada, resultado };
  }

  /** GET /api/projecao e a ferramenta consultar_projecao. */
  async projecao() {
    const { entrada, resultado } = await this.calcular();
    const [[dados], [congelado]] = await Promise.all([
      this.db.query(
        `SELECT to_char(max(data_compra), 'YYYY-MM-DD') AS ultimo FROM transacao
          WHERE deleted_at IS NULL AND importacao_id IS NOT NULL`,
      ),
      this.db.query(`SELECT * FROM snapshot_projecao WHERE id = $1`, [entrada.cicloAtual]),
    ]);
    const parametros = entrada.parametros(entrada.cicloAtual);
    const l = resultado.livreParaGastar;
    return {
      hoje: entrada.hoje,
      cicloAtual: entrada.cicloAtual,
      ultimosDados: (dados?.ultimo as string | null) ?? null,
      configurada: parametros.salario !== null,
      parametros: parametrosNaApi(parametros),
      livreParaGastar: { orcamento: deCentavos(l.orcamento), usado: deCentavos(l.usado), livre: deCentavos(l.livre) },
      congelamentoDoCicloAtual: congelado ? congelamentoNaApi(congelado) : null,
      ciclos: resultado.ciclos.map(cicloNaApi),
    };
  }
}
export type ProjecaoNaApi = Awaited<ReturnType<ProjecaoService['projecao']>>;
