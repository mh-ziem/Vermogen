import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { z } from 'zod';

/** Valida o corpo ou a consulta com zod; erro vira 400 com mensagem legível. */
export function validar<T extends z.ZodType>(esquema: T, valor: unknown): z.infer<T> {
  const r = esquema.safeParse(valor);
  if (r.success) return r.data;
  const mensagens = r.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message));
  throw new BadRequestException(mensagens.join('; '));
}

/** Traduz violações de restrição do PostgreSQL em respostas HTTP. */
export function traduzirErroDoBanco(erro: unknown, mensagens: Record<string, string> = {}): never {
  const e = erro as { code?: string; constraint?: string; message?: string };
  const porRestricao = e.constraint ? mensagens[e.constraint] : undefined;
  if (e.code === '23505') throw new ConflictException(porRestricao ?? 'Já existe um registro com esse nome');
  if (e.code === '23P01') throw new ConflictException(porRestricao ?? 'Conflito de vigência');
  if (e.code === '23503') throw new NotFoundException(porRestricao ?? 'Registro relacionado não encontrado');
  if (e.code === '23514') throw new BadRequestException(porRestricao ?? 'Valor fora do permitido');
  throw erro;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function idValido(id: string): string {
  if (!UUID.test(id)) throw new NotFoundException('Registro não encontrado');
  return id;
}
