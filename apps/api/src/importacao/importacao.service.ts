import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { alterar } from '../comum/banco.js';
import { type Autor, Escrita } from '../auditoria/escrita.js';
import type { Data } from '../calendario/datas.js';
import { CiclosService } from '../calendario/ciclos.service.js';
import { descreverCiclo } from '../calendario/regras.js';
import { CadastrosService } from '../cadastros/cadastros.service.js';
import type { TipoDeTransacao } from '../classificacao/regras.js';
import { centavosDoBanco, deCentavos } from '../comum/dinheiro.js';
import { TransacoesService } from '../transacoes/transacoes.service.js';
import { type ItemDoLote, conferir, hashDoLote, mensagemDeDiferenca } from './regras.js';

export interface Lote {
  contaId: string;
  documento: string;
  periodo: { de: Data; ate: Data };
  fatura?: { fechamento: Data; vencimento: Data } | undefined;
  total?: number | undefined;
  saldoInicial?: number | undefined;
  saldoFinal?: number | undefined;
  itens: (ItemDoLote & { categoriaId?: string | undefined; tipo?: TipoDeTransacao | undefined })[];
}

export interface ResultadoDaImportacao {
  status: 'aceito' | 'nao_conferido' | 'repetido';
  loteId: string;
  conferencia: 'total' | 'saldo' | 'nenhuma';
  itens: number;
  novas: number;
  possiveisDuplicatas: number;
  semCategoria: number;
  mensagem: string;
}

export interface LoteListado {
  id: string;
  fonte: string;
  conta: { id: string; nome: string; instituicao: string; cor: string };
  documento: string;
  periodo: { de: Data; ate: Data };
  vencimentoDaFatura: Data | null;
  total: string | null;
  saldoInicial: string | null;
  saldoFinal: string | null;
  conferencia: string;
  status: 'aceito' | 'nao_conferido' | 'desfeito';
  itens: number;
  novas: number;
  duplicadas: number;
  criadoEm: string;
}

interface LinhaLote {
  id: string;
  fonte: string;
  conta_id: string;
  conta_nome: string;
  inst_nome: string;
  inst_cor: string;
  documento: string;
  de: string;
  ate: string;
  vencimento: string | null;
  total_declarado: string | null;
  saldo_inicial: string | null;
  saldo_final: string | null;
  conferencia: string;
  status: LoteListado['status'];
  itens: number;
  novas: number;
  duplicadas: number;
  criado_em: Date;
}

const dinheiro = (v: string | null) => (v === null ? null : deCentavos(centavosDoBanco(v)!));

@Injectable()
export class ImportacaoService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(Escrita) private readonly escrita: Escrita,
    @Inject(CiclosService) private readonly ciclos: CiclosService,
    @Inject(CadastrosService) private readonly cadastros: CadastrosService,
    @Inject(TransacoesService) private readonly transacoes: TransacoesService,
  ) {}

  /**
   * HU-08: importa um lote. Confere a soma (QA-04), recusa repetição (QA-05) e grava tudo
   * numa única transação de banco: ou o lote entra inteiro, ou nada entra.
   */
  async importar(autor: Autor, fonte: 'claude' | 'manual', lote: Lote): Promise<ResultadoDaImportacao> {
    const conta = await this.cadastros.obterConta(lote.contaId);
    if (!conta.ativa || !conta.instituicao.ativa) throw new BadRequestException('A conta está inativa');
    if (lote.periodo.ate < lote.periodo.de) throw new BadRequestException('O período termina antes de começar');
    if (lote.fatura && !conta.cartao) throw new BadRequestException('Só lote de cartão tem fatura');
    if (lote.fatura && lote.fatura.vencimento <= lote.fatura.fechamento) {
      throw new BadRequestException('O vencimento da fatura precisa ser depois do fechamento');
    }
    if (!conta.cartao) {
      const fora = lote.itens.filter((i) => i.data < lote.periodo.de || i.data > lote.periodo.ate);
      if (fora.length) {
        throw new BadRequestException(
          `${fora.length} item(ns) fora do período ${lote.periodo.de} a ${lote.periodo.ate} (ex.: ${fora[0]!.data} ${fora[0]!.descricao})`,
        );
      }
    }

    const soma = lote.itens.reduce((s, i) => s + i.centavos, 0);
    const conferencia = conferir(lote.itens, lote);
    if (conferencia.diferenca !== 0) throw new UnprocessableEntityException(mensagemDeDiferenca(conferencia, soma));

    const hash = hashDoLote(lote.contaId, lote.itens);
    const repetido = await this.loteRepetido(lote, hash);
    if (repetido) return repetido;

    const status = conferencia.modo === 'nenhuma' ? 'nao_conferido' : 'aceito';
    const reais = await this.ciclos.datasReais();
    try {
      return await this.escrita.executar(autor, async (m) => {
        let faturaDoLote: string | null = null;
        if (lote.fatura) {
          faturaDoLote = (await this.transacoes.resolverPagamento(m, lote.contaId, lote.fatura.fechamento, reais, lote.fatura)).faturaId;
        }
        const [imp] = await m.query(
          `INSERT INTO importacao (fonte, conta_id, documento, periodo_de, periodo_ate, fatura_id, total_declarado,
             saldo_inicial, saldo_final, conferencia, hash, status, itens, novas, duplicadas)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0, 0) RETURNING id`,
          [
            fonte,
            lote.contaId,
            lote.documento,
            lote.periodo.de,
            lote.periodo.ate,
            faturaDoLote,
            lote.total === undefined ? null : deCentavos(lote.total),
            lote.saldoInicial === undefined ? null : deCentavos(lote.saldoInicial),
            lote.saldoFinal === undefined ? null : deCentavos(lote.saldoFinal),
            conferencia.modo,
            hash,
            status,
            lote.itens.length,
          ],
        );

        const itens = [];
        for (const item of lote.itens) {
          const pagamento = lote.fatura
            ? { dataPagamento: lote.fatura.vencimento, faturaId: faturaDoLote }
            : await this.transacoes.resolverPagamento(m, lote.contaId, item.data, reais);
          itens.push({ ...item, contaId: lote.contaId, ...pagamento });
        }
        const r = await this.transacoes.gravar(m, itens, fonte === 'claude' ? 'claude' : 'manual', imp.id);
        const novas = lote.itens.length - r.duplicadas;
        await m.query(`UPDATE importacao SET novas = $2, duplicadas = $3 WHERE id = $1`, [imp.id, novas, r.duplicadas]);

        return {
          status,
          loteId: imp.id,
          conferencia: conferencia.modo,
          itens: lote.itens.length,
          novas,
          possiveisDuplicatas: r.duplicadas,
          semCategoria: r.semCategoria,
          mensagem:
            status === 'aceito'
              ? `Lote aceito: ${lote.itens.length} transações (${conferencia.modo === 'total' ? 'soma confere com o total' : 'saldo confere'}).`
              : 'Lote gravado como "não conferido": o documento não trouxe total nem saldos. Fica nas pendências até ser revisado.',
        };
      });
    } catch (erro) {
      // Dois envios simultâneos do mesmo lote: o índice único do hash segura o segundo.
      if ((erro as { constraint?: string }).constraint === 'importacao_hash_unico') {
        const r = await this.loteRepetido(lote, hash);
        if (r) return r;
      }
      throw erro;
    }
  }

  /**
   * QA-05: o mesmo conteúdo (hash), ou a mesma conta + período + total/saldo final de um lote
   * ainda válido, não entra de novo.
   */
  private async loteRepetido(lote: Lote, hash: string): Promise<ResultadoDaImportacao | null> {
    const [existente] = await this.db.query(
      `SELECT id, conferencia, itens FROM importacao
        WHERE status <> 'desfeito' AND (
          hash = $1
          OR (conta_id = $2 AND periodo_de = $3 AND periodo_ate = $4
              AND ((total_declarado IS NOT NULL AND total_declarado = $5::numeric)
                OR (saldo_final IS NOT NULL AND saldo_final = $6::numeric))))
        LIMIT 1`,
      [
        hash,
        lote.contaId,
        lote.periodo.de,
        lote.periodo.ate,
        lote.total === undefined ? null : deCentavos(lote.total),
        lote.saldoFinal === undefined ? null : deCentavos(lote.saldoFinal),
      ],
    );
    if (!existente) return null;
    return {
      status: 'repetido',
      loteId: existente.id,
      conferencia: existente.conferencia,
      itens: existente.itens,
      novas: 0,
      possiveisDuplicatas: 0,
      semCategoria: 0,
      mensagem: 'Este lote já foi importado; nada novo foi gravado. Para reimportar, desfaça o lote anterior.',
    };
  }

  /** HU-09: desfaz o lote inteiro. As transações vão para a lixeira e o lote pode ser reimportado. */
  async desfazer(autor: Autor, loteId: string): Promise<LoteListado> {
    await this.escrita.executar(autor, async (m) => {
      const [lote] = await m.query(`SELECT status FROM importacao WHERE id = $1 FOR UPDATE`, [loteId]);
      if (!lote) throw new NotFoundException('Lote não encontrado');
      if (lote.status === 'desfeito') throw new ConflictException('O lote já foi desfeito');
      await m.query(
        `UPDATE transacao SET deleted_at = now(), atualizado_em = now() WHERE importacao_id = $1 AND deleted_at IS NULL`,
        [loteId],
      );
      await m.query(`UPDATE importacao SET status = 'desfeito', atualizado_em = now() WHERE id = $1`, [loteId]);
    });
    return this.obter(loteId);
  }

  /** HU-13 CA2: lote não conferido revisado e aceito. */
  async aceitar(autor: Autor, loteId: string): Promise<LoteListado> {
    await this.escrita.executar(autor, async (m) => {
      const linhas = await alterar(
        m,
        `UPDATE importacao SET status = 'aceito', atualizado_em = now() WHERE id = $1 AND status = 'nao_conferido' RETURNING id`,
        [loteId],
      );
      if (!linhas.length) throw new ConflictException('Só lote "não conferido" pode ser aceito');
    });
    return this.obter(loteId);
  }

  async obter(id: string): Promise<LoteListado> {
    const [l] = await this.listar({ id });
    if (!l) throw new NotFoundException('Lote não encontrado');
    return l;
  }

  async listar(filtro: { id?: string; contaId?: string; ciclo?: string; status?: string }): Promise<LoteListado[]> {
    let inicio: Data | null = null;
    let fim: Data | null = null;
    if (filtro.ciclo) {
      const c = descreverCiclo(filtro.ciclo, await this.ciclos.datasReais());
      [inicio, fim] = [c.inicio, c.fim];
    }
    const linhas: LinhaLote[] = await this.db.query(
      `SELECT l.id, l.fonte, l.conta_id, c.nome AS conta_nome, i.nome AS inst_nome, i.cor AS inst_cor, l.documento,
              to_char(l.periodo_de, 'YYYY-MM-DD') AS de, to_char(l.periodo_ate, 'YYYY-MM-DD') AS ate,
              to_char(f.vencimento, 'YYYY-MM-DD') AS vencimento, l.total_declarado, l.saldo_inicial, l.saldo_final,
              l.conferencia, l.status, l.itens, l.novas, l.duplicadas, l.criado_em
         FROM importacao l
         JOIN conta c ON c.id = l.conta_id JOIN instituicao i ON i.id = c.instituicao_id
         LEFT JOIN fatura f ON f.id = l.fatura_id
        WHERE ($1::uuid IS NULL OR l.id = $1::uuid) AND ($2::uuid IS NULL OR l.conta_id = $2::uuid)
          AND ($3::text IS NULL OR l.status = $3::text)
          AND ($4::date IS NULL OR (l.periodo_ate >= $4::date AND l.periodo_de <= $5::date))
        ORDER BY l.criado_em DESC LIMIT 200`,
      [filtro.id ?? null, filtro.contaId ?? null, filtro.status ?? null, inicio, fim],
    );
    return linhas.map(
      (l): LoteListado => ({
        id: l.id,
        fonte: l.fonte,
        conta: { id: l.conta_id, nome: l.conta_nome, instituicao: l.inst_nome, cor: l.inst_cor },
        documento: l.documento,
        periodo: { de: l.de, ate: l.ate },
        vencimentoDaFatura: l.vencimento,
        total: dinheiro(l.total_declarado),
        saldoInicial: dinheiro(l.saldo_inicial),
        saldoFinal: dinheiro(l.saldo_final),
        conferencia: l.conferencia,
        status: l.status,
        itens: l.itens,
        novas: l.novas,
        duplicadas: l.duplicadas,
        criadoEm: new Date(l.criado_em).toISOString(),
      }),
    );
  }
}
