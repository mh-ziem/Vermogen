import type { DataSource, EntityManager } from 'typeorm';

/**
 * Executa um UPDATE ou DELETE com RETURNING e devolve só as linhas.
 * O TypeORM devolve `[linhas, quantidade]` nesses comandos (e só as linhas no SELECT e no INSERT);
 * usar esta função evita confundir os dois formatos.
 */
export async function alterar<T = Record<string, unknown>>(
  m: EntityManager | DataSource,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const resultado: unknown = await m.query(sql, params);
  if (Array.isArray(resultado) && resultado.length === 2 && Array.isArray(resultado[0]) && typeof resultado[1] === 'number') {
    return resultado[0] as T[];
  }
  return resultado as T[];
}
