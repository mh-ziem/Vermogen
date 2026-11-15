import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { alterar } from '../comum/banco.js';
import { type Autor, Escrita } from '../auditoria/escrita.js';
import { CiclosService } from '../calendario/ciclos.service.js';
import { ImportacaoService, type LoteListado } from '../importacao/importacao.service.js';
import { SELECT_TRANSACAO, TIPOS_SEM_CATEGORIA, type Transacao, TransacoesService } from '../transacoes/transacoes.service.js';
import { ClassificacaoService } from './classificacao.service.js';

export interface Pendencias {
  total: number;
  semCategoria: Transacao[];
  possiveisDuplicatas: { transacao: Transacao; original: Transacao | null }[];
  lotesNaoConferidos: LoteListado[];
}

export type Resolucao =
  | { tipo: 'categorizar'; transacaoId: string; categoriaId: string; criarRegra?: { padrao: string } | undefined }
  | { tipo: 'duplicata'; transacaoId: string; decisao: 'manter' | 'excluir' }
  | { tipo: 'lote'; loteId: string; decisao: 'aceitar' | 'descartar' };

/** UC-03 / HU-13: o que as regras não resolveram sozinhas. */
@Injectable()
export class PendenciasService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(Escrita) private readonly escrita: Escrita,
    @Inject(CiclosService) private readonly ciclos: CiclosService,
    @Inject(TransacoesService) private readonly transacoes: TransacoesService,
    @Inject(ImportacaoService) private readonly importacao: ImportacaoService,
    @Inject(ClassificacaoService) private readonly classificacao: ClassificacaoService,
  ) {}

  async listar(): Promise<Pendencias> {
    const reais = await this.ciclos.datasReais();
    const [semCategoria, duplicadas, lotes] = await Promise.all([
      this.db.query(
        `${SELECT_TRANSACAO} WHERE t.deleted_at IS NULL AND t.categoria_id IS NULL AND t.tipo <> ALL($1)
         ORDER BY t.data_pagamento DESC LIMIT 500`,
        [TIPOS_SEM_CATEGORIA],
      ),
      this.db.query(`${SELECT_TRANSACAO} WHERE t.deleted_at IS NULL AND t.duplicata = 'suspeita' ORDER BY t.data_compra DESC LIMIT 500`),
      this.importacao.listar({ status: 'nao_conferido' }),
    ]);
    const originais = new Map<string, Transacao>();
    const ids = duplicadas.map((d: { duplicata_de: string }) => d.duplicata_de);
    if (ids.length) {
      const linhas = await this.db.query(`${SELECT_TRANSACAO} WHERE t.id = ANY($1)`, [ids]);
      for (const l of linhas) originais.set(l.id, this.transacoes.paraApi(l, reais));
    }
    const lista = {
      semCategoria: semCategoria.map((l: never) => this.transacoes.paraApi(l, reais)),
      possiveisDuplicatas: duplicadas.map((l: { duplicata_de: string }) => ({
        transacao: this.transacoes.paraApi(l as never, reais),
        original: originais.get(l.duplicata_de) ?? null,
      })),
      lotesNaoConferidos: lotes,
    };
    return {
      total: lista.semCategoria.length + lista.possiveisDuplicatas.length + lista.lotesNaoConferidos.length,
      ...lista,
    };
  }

  /** Resolve uma pendência. Tudo fica no log de auditoria com o autor (HU-13 CA3). */
  async resolver(autor: Autor, r: Resolucao): Promise<{ ok: true; resolucao: string }> {
    switch (r.tipo) {
      case 'categorizar': {
        await this.escrita.executar(autor, async (m) => {
          await this.classificacao.exigirCategoriaAtiva(m, r.categoriaId);
          const linhas = await alterar(
            m,
            `UPDATE transacao SET categoria_id = $2, atualizado_em = now()
              WHERE id = $1 AND deleted_at IS NULL AND tipo <> ALL($3) RETURNING id`,
            [r.transacaoId, r.categoriaId, TIPOS_SEM_CATEGORIA],
          );
          if (!linhas.length) throw new NotFoundException('Transação não encontrada (ou é transferência/pagamento de fatura)');
          if (r.criarRegra) await this.classificacao.criarRegra(autor, { padrao: r.criarRegra.padrao, categoriaId: r.categoriaId }, m);
        });
        return { ok: true, resolucao: r.criarRegra ? 'categorizada; regra criada para as próximas' : 'categorizada' };
      }
      case 'duplicata': {
        await this.escrita.executar(autor, async (m) => {
          const [t] = await m.query(`SELECT duplicata FROM transacao WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [r.transacaoId]);
          if (!t) throw new NotFoundException('Transação não encontrada');
          if (t.duplicata !== 'suspeita') throw new BadRequestException('A transação não está marcada como possível duplicata');
          // D2: só uma pessoa (ou o Claude, com registro) decide se é duplicata.
          await m.query(
            r.decisao === 'manter'
              ? `UPDATE transacao SET duplicata = 'nao_e', atualizado_em = now() WHERE id = $1`
              : `UPDATE transacao SET deleted_at = now(), atualizado_em = now() WHERE id = $1`,
            [r.transacaoId],
          );
        });
        return { ok: true, resolucao: r.decisao === 'manter' ? 'não é duplicata; mantida' : 'duplicata enviada para a lixeira' };
      }
      case 'lote': {
        if (r.decisao === 'aceitar') await this.importacao.aceitar(autor, r.loteId);
        else await this.importacao.desfazer(autor, r.loteId);
        return { ok: true, resolucao: r.decisao === 'aceitar' ? 'lote aceito' : 'lote descartado' };
      }
    }
  }
}
