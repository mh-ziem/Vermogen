import { z } from 'zod';
import { valor } from '../transacoes/esquemas.js';

const positivo = valor.refine((c) => c >= 0, 'use um valor positivo');

export const parametros = z
  .object({
    salario: positivo.optional(),
    aportePercentual: z
      .number()
      .min(0, 'o aporte vai de 0 a 100%')
      .max(100, 'o aporte vai de 0 a 100%')
      .refine((n) => Math.round(n * 100) === n * 100, 'no máximo 2 casas decimais')
      .optional(),
    orcamentoFlexiveis: positivo.optional(),
    folgaMinima: positivo.optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'nada para alterar');

export const valorFixo = z.object({ valor: positivo.nullable() }).strict();

export const plano = z.object({ aporte: positivo, orcamentoFlexiveis: positivo }).strict();
