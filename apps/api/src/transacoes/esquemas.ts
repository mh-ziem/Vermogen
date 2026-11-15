import { z } from 'zod';
import { ehIdCiclo } from '../calendario/regras.js';
import { data } from '../cadastros/esquemas.js';
import { paraCentavos } from '../comum/dinheiro.js';

/** Valor em reais (número com até 2 casas ou texto "-47.90"), convertido para centavos. */
export const valor = z.union([z.number(), z.string()]).transform((v, ctx) => {
  try {
    return paraCentavos(v);
  } catch (e) {
    ctx.addIssue({ code: 'custom', message: (e as Error).message });
    return z.NEVER;
  }
});
const valorNaoZero = valor.refine((c) => c !== 0, 'o valor não pode ser zero');
const valorPositivo = valor.refine((c) => c >= 0, 'use um valor positivo');

export const TIPOS_DE_ITEM = ['receita', 'despesa', 'transferencia', 'pagamento_fatura'] as const;
export const TIPOS = [...TIPOS_DE_ITEM, 'receita_fora_das_contas'] as const;
const descricao = z.string().trim().min(1, 'informe a descrição').max(300, 'no máximo 300 caracteres');

export const itemDoLote = z
  .object({
    data,
    descricao,
    valor: valorNaoZero,
    parcela: z
      .object({ numero: z.number().int().min(1), total: z.number().int().min(1).max(120) })
      .strict()
      .refine((p) => p.numero <= p.total, 'o número da parcela passa do total')
      .optional(),
    categoriaId: z.uuid().optional(),
    tipo: z.enum(TIPOS_DE_ITEM).optional(),
  })
  .strict()
  .transform(({ valor: centavos, ...resto }) => ({ ...resto, centavos }));

export const lote = z
  .object({
    contaId: z.uuid('conta inválida'),
    documento: z.string().trim().min(1, 'descreva o documento').max(200),
    periodo: z.object({ de: data, ate: data }).strict(),
    fatura: z.object({ fechamento: data, vencimento: data }).strict().optional(),
    totalDeclarado: valor.optional(),
    saldoInicial: valor.optional(),
    saldoFinal: valor.optional(),
    itens: z.array(itemDoLote).min(1, 'o lote precisa de pelo menos 1 item').max(500, 'no máximo 500 itens por lote'),
  })
  .strict()
  .refine((l) => (l.saldoInicial === undefined) === (l.saldoFinal === undefined), 'informe saldo inicial e final juntos')
  .transform(({ totalDeclarado, ...resto }) => ({ ...resto, total: totalDeclarado }));

export const lancamento = z
  .object({
    contaId: z.uuid().optional(),
    data,
    descricao,
    valor: valorNaoZero,
    tipo: z.enum(TIPOS).optional(),
    categoriaId: z.uuid().optional(),
    compensaId: z.uuid().optional(),
  })
  .strict()
  .transform(({ valor: centavos, ...resto }) => ({ ...resto, centavos }));

export const edicao = z
  .object({
    descricao: descricao.nullable().optional(),
    categoriaId: z.uuid().nullable().optional(),
    tipo: z.enum(TIPOS_DE_ITEM).optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'nada para alterar');

const simNao = z.enum(['true', 'false']).transform((v) => v === 'true');
export const filtro = z
  .object({
    ciclo: z.string().refine(ehIdCiclo, 'ciclo no formato AAAA-MM').optional(),
    contaId: z.uuid().optional(),
    categoriaId: z.uuid().optional(),
    loteId: z.uuid().optional(),
    semCategoria: simNao.optional(),
    texto: z.string().trim().min(1).max(100).optional(),
    excluidas: simNao.optional(),
    limite: z.coerce.number().int().min(1).max(500).optional(),
    pagina: z.coerce.number().int().min(1).optional(),
  })
  .strict();

export const NATUREZAS = ['intermitente', 'parcelada', 'pontual', 'flexivel'] as const;
const nomeCategoria = z.string().trim().min(1).max(60);
export const novaCategoria = z
  .object({ nome: nomeCategoria, paiId: z.uuid().optional(), natureza: z.enum(NATUREZAS).optional() })
  .strict();
export const edicaoDeCategoria = z
  .object({ nome: nomeCategoria.optional(), natureza: z.enum(NATUREZAS).nullable().optional(), ativa: z.boolean().optional() })
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'nada para alterar');

export const novaRegra = z
  .object({
    padrao: z.string().trim().min(2, 'o texto precisa de pelo menos 2 caracteres').max(100),
    contaId: z.uuid().optional(),
    valorMinimo: valorPositivo.optional(),
    valorMaximo: valorPositivo.optional(),
    categoriaId: z.uuid().optional(),
    tipo: z.enum(TIPOS_DE_ITEM).optional(),
    prioridade: z.number().int().min(-100).max(100).optional(),
  })
  .strict()
  .refine((r) => r.categoriaId || r.tipo, 'a regra precisa definir a categoria, o tipo ou os dois')
  .refine(
    (r) => r.valorMinimo === undefined || r.valorMaximo === undefined || r.valorMinimo <= r.valorMaximo,
    'o valor mínimo passa do máximo',
  );
export const edicaoDeRegra = z
  .object({ prioridade: z.number().int().min(-100).max(100).optional(), ativa: z.boolean().optional(), categoriaId: z.uuid().optional() })
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'nada para alterar');

export const resolucao = z.discriminatedUnion('tipo', [
  z
    .object({
      tipo: z.literal('categorizar'),
      transacaoId: z.uuid(),
      categoriaId: z.uuid(),
      criarRegra: z.object({ padrao: z.string().trim().min(2).max(100) }).strict().optional(),
    })
    .strict(),
  z.object({ tipo: z.literal('duplicata'), transacaoId: z.uuid(), decisao: z.enum(['manter', 'excluir']) }).strict(),
  z.object({ tipo: z.literal('lote'), loteId: z.uuid(), decisao: z.enum(['aceitar', 'descartar']) }).strict(),
]);
