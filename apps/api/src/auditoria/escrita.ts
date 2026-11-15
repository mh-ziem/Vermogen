import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { DataSource, type EntityManager } from 'typeorm';

/** Quem fez a alteração (PRD §9.4, Log de auditoria). */
export type Autor = 'matheus' | 'claude' | 'sistema';

/** Autor da requisição: sessão do navegador = Matheus; token do MCP = Claude (DT-11). */
export function autorDa(req: Request): Autor {
  if (req.tokenMcp) return 'claude';
  if (req.sessao) return 'matheus';
  throw new Error('Requisição sem autenticação não pode gravar');
}

/**
 * Único caminho para gravar dados (DT-09). Abre uma transação e informa o autor ao banco;
 * os gatilhos de auditoria leem esse valor e recusam a gravação se ele faltar.
 */
@Injectable()
export class Escrita {
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  async executar<T>(autor: Autor, trabalho: (m: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(async (m) => {
      await m.query(`SELECT set_config('vermogen.autor', $1, true)`, [autor]);
      return trabalho(m);
    });
  }
}
