import { type Data, anoMes, criarData, dia, diferencaEmDias, somarMeses, ultimoDiaDoMes } from '../calendario/datas.js';
import { type Ciclo, type DatasReais, type IdCiclo, cicloDaData, descreverCiclo, somarCiclos } from '../calendario/regras.js';
import type { TipoDeTransacao } from '../classificacao/regras.js';
import { normalizarTexto } from '../comum/texto.js';
import { type DiasDoCartao, faturaSeguinte, faturasComVencimentoEntre } from '../faturas/regras.js';

/**
 * Projeção dos próximos ciclos (HU-15, RN-06, RN-07, RN-10, RN-11, RN-16). Função pura: recebe os
 * dados já lidos do banco e devolve a projeção, em centavos, com o sinal do dinheiro (positivo entra,
 * negativo sai). Regras do MVP registradas no SAD (DM-25 a DM-31).
 */

export type Natureza = 'intermitente' | 'parcelada' | 'pontual' | 'flexivel';

export interface Parametros {
  /** Salário líquido mensal; null enquanto não configurado. */
  salario: number | null;
  aportePercentual: number;
  orcamentoFlexiveis: number;
  folgaMinima: number;
}

export interface Plano {
  aporte: number;
  orcamentoFlexiveis: number;
}

export interface Cartao {
  id: string;
  nome: string;
  instituicao: string;
  cor: string;
  dias: DiasDoCartao;
}

export interface FaturaGravada {
  id: string;
  contaId: string;
  fechamento: Data;
  vencimento: Data;
}

/** Transação gravada, com a categoria e a natureza efetivas (da subcategoria ou da categoria-pai). */
export interface Movimento {
  contaId: string | null;
  /** A conta é um cartão. */
  cartao: boolean;
  faturaId: string | null;
  dataCompra: Data;
  dataPagamento: Data;
  centavos: number;
  tipo: TipoDeTransacao;
  /** Receita fora das contas que compensa outra transação (D3): conta na categoria da compensada. */
  compensa: boolean;
  categoriaId: string | null;
  categoriaNome: string | null;
  natureza: Natureza | null;
  parcela: { numero: number; total: number } | null;
  descricao: string;
}

/** Parcela gravada, para achar as parcelas futuras da mesma compra. */
export interface ParcelaGravada {
  contaId: string;
  /** Dias do cartão, se a conta for cartão. */
  cartao: DiasDoCartao | null;
  /** Fechamento da fatura em que a parcela entrou (só cartão). */
  fechamento: Data | null;
  dataPagamento: Data;
  centavos: number;
  numero: number;
  total: number;
  descricao: string;
}

export interface ValorFixo {
  categoriaId: string;
  aPartirDe: IdCiclo;
  /** null = volta ao cálculo pelo maior dos 3 ciclos. */
  centavos: number | null;
}

export interface EntradaDaProjecao {
  hoje: Data;
  reais: DatasReais;
  cicloAtual: IdCiclo;
  horizonte: number;
  /** Parâmetros vigentes em cada ciclo, do ciclo anterior ao atual até o último do horizonte. */
  parametros: (ciclo: IdCiclo) => Parametros;
  planos: ReadonlyMap<IdCiclo, Plano>;
  cartoes: readonly Cartao[];
  faturas: readonly FaturaGravada[];
  /** Transações com compra ou pagamento entre o 3º ciclo antes do atual e o fim do horizonte. */
  movimentos: readonly Movimento[];
  parcelas: readonly ParcelaGravada[];
  /** Categorias de natureza intermitente (efetiva), ativas. */
  intermitentes: readonly { id: string; nome: string }[];
  valoresFixos: readonly ValorFixo[];
}

export type StatusDaFatura = 'fechada' | 'a_importar' | 'projetada';
export type Veredito = 'positivo' | 'moderado' | 'negativo';

export interface Item {
  descricao: string;
  centavos: number;
  origem: 'realizado' | 'parcela' | 'recorrente' | 'estimativa';
}

export interface FaturaProjetada {
  cartao: Cartao;
  fechamento: Data;
  vencimento: Data;
  status: StatusDaFatura;
  centavos: number;
  realizado: number;
  itens: Item[];
}

export interface FixaProjetada {
  descricao: string;
  categoriaId: string | null;
  centavos: number;
  base: 'fixo' | 'maior_3' | 'realizado' | 'parcela';
  historico: { ciclo: IdCiclo; centavos: number }[];
}

export interface CicloProjetado {
  ciclo: Ciclo;
  receita: number;
  dizimo: number;
  faturas: FaturaProjetada[];
  flexiveisNosCartoes: { centavos: number; orcamentoDoCicloAnterior: number; gastoNoCicloAnterior: number };
  fixas: FixaProjetada[];
  totais: { faturas: number; fixas: number };
  aporte: number;
  aportePercentual: number;
  orcamentoFlexiveis: number;
  resultadoLiquido: number;
  veredito: Veredito;
  ajustado: boolean;
}

export interface ResultadoDaProjecao {
  livreParaGastar: { orcamento: number; usado: number; livre: number };
  ciclos: CicloProjetado[];
}

/** RN-07: dízimo de 10% sobre o salário. */
export const PERCENTUAL_DO_DIZIMO = 10;

const soma = (valores: Iterable<number>) => {
  let total = 0;
  for (const v of valores) total += v;
  return total;
};
const porcentagem = (centavos: number, percentual: number) => Math.round((centavos * percentual) / 100);

/** RN-16: positivo a partir da folga mínima; moderado entre zero e a folga; negativo abaixo de zero. */
export function veredito(resultado: number, folgaMinima: number): Veredito {
  if (resultado >= folgaMinima) return 'positivo';
  if (resultado >= 0) return 'moderado';
  return 'negativo';
}

/**
 * Chave da compra parcelada: conta, número de parcelas, valor da parcela e descrição sem o
 * "n/N" (bancos escrevem "PARC 02/06", "2 de 6"...). Identifica a mesma compra em faturas diferentes.
 */
export function chaveDaCompraParcelada(p: Pick<ParcelaGravada, 'contaId' | 'total' | 'centavos' | 'descricao'>): string {
  const descricao = normalizarTexto(p.descricao)
    .replace(/\b(parc(ela)?\.?\s*)?\d{1,3}\s*(\/|de)\s*\d{1,3}\b/g, ' ')
    .replace(/\bparc(ela)?\b\.?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return [p.contaId, p.total, p.centavos, descricao].join('|');
}

function somarMesesNaData(data: Data, meses: number): Data {
  const [ano, mes] = somarMeses(...anoMes(data), meses);
  return criarData(ano, mes, Math.min(dia(data), ultimoDiaDoMes(ano, mes)));
}

export interface ParcelaFutura {
  contaId: string;
  cartao: boolean;
  dataPagamento: Data;
  centavos: number;
  numero: number;
  total: number;
  descricao: string;
}

/**
 * Parcelas ainda não gravadas (DM-25): para cada compra parcelada, parte da última parcela gravada
 * e projeta as seguintes, uma por fatura no cartão e uma por mês nas demais contas.
 */
export function parcelasFuturas(parcelas: readonly ParcelaGravada[], ate: Data): ParcelaFutura[] {
  const porCompra = new Map<string, ParcelaGravada[]>();
  for (const p of parcelas) {
    const chave = chaveDaCompraParcelada(p);
    porCompra.set(chave, [...(porCompra.get(chave) ?? []), p]);
  }
  const futuras: ParcelaFutura[] = [];
  for (const grupo of porCompra.values()) {
    // As últimas gravadas são as do pagamento mais recente; duas compras iguais na mesma fatura
    // aparecem como duas linhas ali e seguem separadas.
    const ultimoPagamento = grupo.reduce((m, p) => (p.dataPagamento > m ? p.dataPagamento : m), '');
    for (const p of grupo.filter((x) => x.dataPagamento === ultimoPagamento && x.numero < x.total)) {
      let fatura = p.cartao && p.fechamento ? { fechamento: p.fechamento, vencimento: p.dataPagamento } : null;
      for (let n = p.numero + 1; n <= p.total; n++) {
        let pagamento: Data;
        if (p.cartao && fatura) {
          fatura = faturaSeguinte(fatura.fechamento, p.cartao);
          pagamento = fatura.vencimento;
        } else {
          pagamento = somarMesesNaData(p.dataPagamento, n - p.numero);
        }
        if (pagamento > ate) break;
        futuras.push({
          contaId: p.contaId,
          cartao: p.cartao !== null,
          dataPagamento: pagamento,
          centavos: p.centavos,
          numero: n,
          total: p.total,
          descricao: p.descricao,
        });
      }
    }
  }
  return futuras;
}

/** Despesa que consome o orçamento de flexíveis: tudo o que não é fixa/intermitente nem parcela (DM-27). */
export function ehGastoFlexivel(m: Movimento): boolean {
  if (m.tipo !== 'despesa' && !(m.tipo === 'receita_fora_das_contas' && m.compensa)) return false;
  return m.natureza !== 'intermitente' && m.parcela === null;
}

/** Entra na soma da fatura: compras, estornos e tarifas; não o pagamento da própria fatura. */
function contaNaFatura(m: Movimento): boolean {
  return m.tipo !== 'pagamento_fatura' && m.tipo !== 'transferencia';
}

function ehFixaForaDoCartao(m: Movimento): boolean {
  return !m.cartao && m.natureza === 'intermitente' && (m.tipo === 'despesa' || m.compensa);
}

export function projetar(e: EntradaDaProjecao): ResultadoDaProjecao {
  const reais = e.reais;
  const cicloDe = (d: Data) => cicloDaData(d, reais);
  const ultimo = somarCiclos(e.cicloAtual, e.horizonte - 1);
  const fimDoHorizonte = descreverCiclo(ultimo, reais).fim;
  const historicoIds = [3, 2, 1].map((n) => somarCiclos(e.cicloAtual, -n));

  // Índices dos movimentos por ciclo de compra e de pagamento.
  const porPagamento = new Map<IdCiclo, Movimento[]>();
  const porCompra = new Map<IdCiclo, Movimento[]>();
  const porFatura = new Map<string, Movimento[]>();
  for (const m of e.movimentos) {
    const cp = cicloDe(m.dataPagamento);
    porPagamento.set(cp, [...(porPagamento.get(cp) ?? []), m]);
    const cc = cicloDe(m.dataCompra);
    porCompra.set(cc, [...(porCompra.get(cc) ?? []), m]);
    if (m.faturaId) porFatura.set(m.faturaId, [...(porFatura.get(m.faturaId) ?? []), m]);
  }
  const pagosEm = (c: IdCiclo) => porPagamento.get(c) ?? [];

  const planoOuParametro = (c: IdCiclo) => {
    const p = e.parametros(c);
    const plano = e.planos.get(c);
    const receita = p.salario ?? 0;
    return {
      p,
      receita,
      aporte: plano?.aporte ?? porcentagem(receita, p.aportePercentual),
      orcamentoFlexiveis: plano?.orcamentoFlexiveis ?? p.orcamentoFlexiveis,
      ajustado: plano !== undefined,
    };
  };
  const gastoFlexivel = (c: IdCiclo) => -soma((porCompra.get(c) ?? []).filter(ehGastoFlexivel).map((m) => m.centavos));

  // RN-10: maior gasto dos últimos 3 ciclos completos, por categoria intermitente.
  const gastoNaCategoria = (movs: readonly Movimento[], categoriaId: string) =>
    -soma(movs.filter((m) => m.categoriaId === categoriaId).map((m) => m.centavos));
  const historicoForaDoCartao = new Map(
    e.intermitentes.map((cat) => [
      cat.id,
      historicoIds.map((c) => ({ ciclo: c, centavos: gastoNaCategoria(pagosEm(c).filter(ehFixaForaDoCartao), cat.id) })),
    ]),
  );
  const fixasDoCartao = (cartaoId: string) =>
    e.intermitentes.map((cat) => ({
      cat,
      estimativa: Math.max(
        0,
        ...historicoIds.map((c) =>
          gastoNaCategoria(
            pagosEm(c).filter((m) => m.contaId === cartaoId && m.natureza === 'intermitente' && contaNaFatura(m)),
            cat.id,
          ),
        ),
      ),
    }));
  const valorFixo = (categoriaId: string, c: IdCiclo): number | null => {
    const vigente = e.valoresFixos
      .filter((v) => v.categoriaId === categoriaId && v.aPartirDe <= c)
      .sort((a, b) => (a.aPartirDe < b.aPartirDe ? 1 : -1))[0];
    return vigente?.centavos ?? null;
  };

  const futuras = parcelasFuturas(e.parcelas, fimDoHorizonte);

  const ciclos: CicloProjetado[] = [];
  for (let i = 0; i < e.horizonte; i++) {
    const id = somarCiclos(e.cicloAtual, i);
    const ciclo = descreverCiclo(id, reais);
    const { p, receita, aporte, orcamentoFlexiveis, ajustado } = planoOuParametro(id);

    // ----- Faturas (RN-08, RN-11, E-04) -----
    const faturas: FaturaProjetada[] = [];
    for (const cartao of e.cartoes) {
      const gravadas = e.faturas.filter((f) => f.contaId === cartao.id && ciclo.inicio <= f.vencimento && f.vencimento <= ciclo.fim);
      // A fatura gravada traz as datas do documento; a calculada perto dela é a mesma fatura.
      const calculadas = faturasComVencimentoEntre(cartao.dias, ciclo.inicio, ciclo.fim).filter(
        (c) => !gravadas.some((g) => Math.abs(diferencaEmDias(g.vencimento, c.vencimento)) <= 15),
      );
      const doCiclo = [
        ...gravadas.map((g) => ({ id: g.id as string | null, fechamento: g.fechamento, vencimento: g.vencimento })),
        ...calculadas.map((c) => ({ id: null as string | null, ...c })),
      ].sort((a, b) => (a.vencimento < b.vencimento ? -1 : 1));

      doCiclo.forEach((f, ordem) => {
        const gravados = (f.id ? (porFatura.get(f.id) ?? []) : []).filter(contaNaFatura);
        const realizado = soma(gravados.map((m) => m.centavos));
        const itens: Item[] = agruparRealizados(gravados);
        const fechou = f.fechamento <= e.hoje;
        if (fechou && gravados.length > 0) {
          faturas.push({ cartao, ...f, status: 'fechada', centavos: realizado, realizado, itens });
          return;
        }
        // Fatura aberta, ou fechada sem documento: o gravado mais a estimativa do que falta.
        // Parcelas futuras e fixas do cartão entram na primeira fatura do cartão no ciclo.
        let centavos = realizado;
        if (ordem === 0) {
          for (const pf of futuras.filter((x) => x.cartao && x.contaId === cartao.id && cicloDe(x.dataPagamento) === id)) {
            centavos += pf.centavos;
            itens.push({ descricao: `${pf.descricao} · parcela ${pf.numero}/${pf.total}`, centavos: pf.centavos, origem: 'parcela' });
          }
          // Fixas e intermitentes pagas neste cartão: o que falta para a estimativa (RN-10).
          for (const { cat, estimativa } of fixasDoCartao(cartao.id)) {
            const jaGravado = gastoNaCategoria(gravados, cat.id);
            const falta = Math.max(0, estimativa - Math.max(0, jaGravado));
            if (falta > 0) {
              centavos -= falta;
              itens.push({ descricao: cat.nome, centavos: -falta, origem: 'recorrente' });
            }
          }
        }
        faturas.push({ cartao, ...f, status: fechou ? 'a_importar' : 'projetada', centavos, realizado, itens });
      });
    }

    // Orçamento de flexíveis do ciclo anterior ainda não gasto: pago nas faturas deste ciclo (RN-11).
    const anterior = somarCiclos(id, -1);
    const orcamentoAnterior = planoOuParametro(anterior).orcamentoFlexiveis;
    const gastoAnterior = gastoFlexivel(anterior);
    const todasFecharam = e.cartoes.length > 0 && faturas.every((f) => f.status === 'fechada');
    const flexiveis = todasFecharam ? 0 : -Math.max(0, orcamentoAnterior - gastoAnterior);

    // ----- Fixas e intermitentes fora do cartão (RN-10) e parcelas fora do cartão -----
    const fixas: FixaProjetada[] = [];
    for (const cat of e.intermitentes) {
      const historico = historicoForaDoCartao.get(cat.id)!;
      const fixo = valorFixo(cat.id, id);
      const estimativa = fixo ?? Math.max(0, ...historico.map((h) => h.centavos));
      const realizado = gastoNaCategoria(pagosEm(id).filter(ehFixaForaDoCartao), cat.id);
      const valor = Math.max(estimativa, realizado);
      if (valor <= 0) continue;
      fixas.push({
        descricao: cat.nome,
        categoriaId: cat.id,
        centavos: -valor,
        base: realizado > estimativa ? 'realizado' : fixo !== null ? 'fixo' : 'maior_3',
        historico,
      });
    }
    for (const m of pagosEm(id).filter((x) => !x.cartao && x.parcela && x.tipo === 'despesa')) {
      fixas.push({
        descricao: `${m.descricao} · parcela ${m.parcela!.numero}/${m.parcela!.total}`,
        categoriaId: m.categoriaId,
        centavos: m.centavos,
        base: 'realizado',
        historico: [],
      });
    }
    for (const pf of futuras.filter((x) => !x.cartao && cicloDe(x.dataPagamento) === id)) {
      fixas.push({
        descricao: `${pf.descricao} · parcela ${pf.numero}/${pf.total}`,
        categoriaId: null,
        centavos: pf.centavos,
        base: 'parcela',
        historico: [],
      });
    }

    const totalFaturas = soma(faturas.map((f) => f.centavos)) + flexiveis;
    const totalFixas = soma(fixas.map((f) => f.centavos));
    const dizimo = -porcentagem(receita, PERCENTUAL_DO_DIZIMO);
    const resultado = receita + dizimo + totalFaturas + totalFixas - aporte;
    ciclos.push({
      ciclo,
      receita,
      dizimo,
      faturas,
      flexiveisNosCartoes: { centavos: flexiveis, orcamentoDoCicloAnterior: orcamentoAnterior, gastoNoCicloAnterior: gastoAnterior },
      fixas,
      totais: { faturas: totalFaturas, fixas: totalFixas },
      aporte: -aporte,
      aportePercentual: p.aportePercentual,
      orcamentoFlexiveis,
      resultadoLiquido: resultado,
      veredito: veredito(resultado, p.folgaMinima),
      ajustado,
    });
  }

  const atual = planoOuParametro(e.cicloAtual);
  const usado = Math.max(0, gastoFlexivel(e.cicloAtual));
  return {
    livreParaGastar: { orcamento: atual.orcamentoFlexiveis, usado, livre: atual.orcamentoFlexiveis - usado },
    ciclos,
  };
}

/** Itens já gravados de uma fatura, agrupados por categoria (DS-07). */
function agruparRealizados(movs: readonly Movimento[]): Item[] {
  const grupos = new Map<string, number>();
  for (const m of movs) {
    const nome = m.parcela ? `${m.descricao} · parcela ${m.parcela.numero}/${m.parcela.total}` : (m.categoriaNome ?? 'Sem categoria');
    grupos.set(nome, (grupos.get(nome) ?? 0) + m.centavos);
  }
  return [...grupos.entries()]
    .map(([descricao, centavos]) => ({ descricao, centavos, origem: 'realizado' as const }))
    .sort((a, b) => a.centavos - b.centavos);
}
