import { z } from 'zod';
import { ehData } from '../calendario/datas.js';

export const TIPOS_DE_CONTA = ['corrente', 'cartao', 'investimento', 'uso_restrito'] as const;
export const FINALIDADES = ['gasto', 'recebimento', 'reserva', 'investimento'] as const;
export type TipoDeConta = (typeof TIPOS_DE_CONTA)[number];
export type Finalidade = (typeof FINALIDADES)[number];

/** Primeira vigência de uma conta cadastrada sem data: vale para todo o histórico (SAD DM-13). */
export const DESDE_SEMPRE = '2000-01-01';

const nome = z.string().trim().min(1, 'informe o nome').max(60, 'no máximo 60 caracteres');
const cor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'use o formato #RRGGBB')
  .transform((c) => c.toUpperCase());
const diaDoMes = z.number().int('use um número inteiro').min(1, 'de 1 a 31').max(31, 'de 1 a 31');
export const data = z.string().refine(ehData, 'use uma data válida no formato AAAA-MM-DD');

export const novaInstituicao = z.object({ nome, cor }).strict();
export const edicaoDeInstituicao = z
  .object({ nome: nome.optional(), cor: cor.optional(), ativa: z.boolean().optional() })
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'nada para alterar');

export const novaConta = z
  .object({
    instituicaoId: z.uuid('instituição inválida'),
    nome,
    tipo: z.enum(TIPOS_DE_CONTA),
    finalidade: z.enum(FINALIDADES),
    finalidadeDesde: data.optional(),
    diaFechamento: diaDoMes.optional(),
    diaVencimento: diaDoMes.optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const temDias = c.diaFechamento !== undefined || c.diaVencimento !== undefined;
    if (c.tipo === 'cartao' && (c.diaFechamento === undefined || c.diaVencimento === undefined)) {
      ctx.addIssue({ code: 'custom', message: 'cartão precisa de dia de fechamento e de vencimento' });
    }
    if (c.tipo !== 'cartao' && temDias) {
      ctx.addIssue({ code: 'custom', message: 'só cartão tem dia de fechamento e de vencimento' });
    }
  });

/** O tipo não muda depois do cadastro: um cartão não vira conta corrente (PRD §9.4). */
export const edicaoDeConta = z
  .object({
    nome: nome.optional(),
    ativa: z.boolean().optional(),
    diaFechamento: diaDoMes.optional(),
    diaVencimento: diaDoMes.optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'nada para alterar');

export const mudancaDeFinalidade = z.object({ finalidade: z.enum(FINALIDADES), vigenteDe: data }).strict();
