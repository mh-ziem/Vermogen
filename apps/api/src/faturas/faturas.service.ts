import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { Data } from '../calendario/datas.js';

@Injectable()
export class FaturasService {
  /**
   * Devolve a fatura do cartão com esse vencimento, criando-a se ainda não existir.
   * Fechamento no passado = fatura fechada (M3).
   */
  async garantir(m: EntityManager, contaId: string, fechamento: Data, vencimento: Data, hoje: Data): Promise<string> {
    const status = fechamento <= hoje ? 'fechada' : 'aberta';
    const [f] = await m.query(
      `INSERT INTO fatura (conta_id, fechamento, vencimento, status) VALUES ($1, $2, $3, $4)
       ON CONFLICT (conta_id, vencimento) DO UPDATE
         SET status = CASE WHEN fatura.status = 'aberta' THEN EXCLUDED.status ELSE fatura.status END
       RETURNING id`,
      [contaId, fechamento, vencimento, status],
    );
    return f.id;
  }
}
