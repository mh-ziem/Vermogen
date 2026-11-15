import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { type Data, hoje, somarDias } from '../calendario/datas.js';
import { CiclosService } from '../calendario/ciclos.service.js';
import { type Autor, Escrita } from '../auditoria/escrita.js';
import { alterar } from '../comum/banco.js';
import { traduzirErroDoBanco } from '../comum/erros.js';
import { type FaturaDaCompra, faturaDaCompra } from '../faturas/regras.js';
import { DESDE_SEMPRE, type Finalidade, type TipoDeConta } from './esquemas.js';

export interface Instituicao {
  id: string;
  nome: string;
  cor: string;
  ativa: boolean;
}

export interface Conta {
  id: string;
  nome: string;
  tipo: TipoDeConta;
  ativa: boolean;
  instituicao: Instituicao;
  finalidade: { atual: Finalidade; desde: Data } | null;
  cartao: { diaFechamento: number; diaVencimento: number; proximaFatura: FaturaDaCompra } | null;
}

export interface VigenciaDeFinalidade {
  id: string;
  finalidade: Finalidade;
  vigenteDe: Data;
  vigenteAte: Data | null;
}

const MENSAGENS = {
  instituicao_nome_unico: 'Já existe uma instituição com esse nome',
  conta_nome_unico: 'Já existe uma conta com esse nome nessa instituição',
  conta_instituicao_id_fkey: 'Instituição não encontrada',
  conta_finalidade_sem_sobreposicao: 'A conta já tem outra finalidade nessa data',
};

interface LinhaConta {
  id: string;
  nome: string;
  tipo: TipoDeConta;
  ativa: boolean;
  dia_fechamento: number | null;
  dia_vencimento: number | null;
  inst_id: string;
  inst_nome: string;
  inst_cor: string;
  inst_ativa: boolean;
  finalidade: Finalidade | null;
  finalidade_desde: Data | null;
}

@Injectable()
export class CadastrosService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(Escrita) private readonly escrita: Escrita,
    @Inject(CiclosService) private readonly ciclos: CiclosService,
  ) {}

  // ----- Instituições (HU-03) -------------------------------------------------------

  async listarInstituicoes(incluirInativas: boolean): Promise<Instituicao[]> {
    return this.db.query(
      `SELECT id, nome, cor, ativa FROM instituicao
        WHERE ativa OR $1 ORDER BY ativa DESC, lower(nome)`,
      [incluirInativas],
    );
  }

  async criarInstituicao(autor: Autor, dados: { nome: string; cor: string }): Promise<Instituicao> {
    return this.escrita
      .executar(autor, async (m) => {
        const [linha] = await m.query(
          `INSERT INTO instituicao (nome, cor) VALUES ($1, $2) RETURNING id, nome, cor, ativa`,
          [dados.nome, dados.cor],
        );
        return linha as Instituicao;
      })
      .catch((e) => traduzirErroDoBanco(e, MENSAGENS));
  }

  /** Desativar não apaga nada: o histórico continua ligado à instituição (HU-03 CA2). */
  async atualizarInstituicao(
    autor: Autor,
    id: string,
    dados: { nome?: string; cor?: string; ativa?: boolean },
  ): Promise<Instituicao> {
    const linha = await this.escrita
      .executar(autor, async (m) => {
        const [r] = await alterar<Instituicao>(
          m,
          `UPDATE instituicao SET
             nome = coalesce($2, nome), cor = coalesce($3, cor), ativa = coalesce($4, ativa), atualizado_em = now()
           WHERE id = $1 RETURNING id, nome, cor, ativa`,
          [id, dados.nome ?? null, dados.cor ?? null, dados.ativa ?? null],
        );
        return r;
      })
      .catch((e) => traduzirErroDoBanco(e, MENSAGENS));
    if (!linha) throw new NotFoundException('Instituição não encontrada');
    return linha;
  }

  // ----- Contas (HU-04, HU-05) ------------------------------------------------------

  async listarContas(incluirInativas: boolean, filtro: { id?: string } = {}): Promise<Conta[]> {
    const dia = hoje();
    const linhas: LinhaConta[] = await this.db.query(
      `SELECT c.id, c.nome, c.tipo, c.ativa, c.dia_fechamento, c.dia_vencimento,
              i.id AS inst_id, i.nome AS inst_nome, i.cor AS inst_cor, i.ativa AS inst_ativa,
              f.finalidade, to_char(f.vigente_de, 'YYYY-MM-DD') AS finalidade_desde
         FROM conta c
         JOIN instituicao i ON i.id = c.instituicao_id
         LEFT JOIN conta_finalidade f
           ON f.conta_id = c.id AND f.vigente_de <= $2::date AND (f.vigente_ate IS NULL OR f.vigente_ate >= $2::date)
        WHERE ($1 OR (c.ativa AND i.ativa)) AND ($3::uuid IS NULL OR c.id = $3::uuid)
        ORDER BY lower(i.nome), lower(c.nome)`,
      [incluirInativas, dia, filtro.id ?? null],
    );
    const reais = linhas.some((l) => l.tipo === 'cartao') ? await this.ciclos.datasReais() : new Map();
    return linhas.map((l) => ({
      id: l.id,
      nome: l.nome,
      tipo: l.tipo,
      ativa: l.ativa,
      instituicao: { id: l.inst_id, nome: l.inst_nome, cor: l.inst_cor, ativa: l.inst_ativa },
      finalidade: l.finalidade ? { atual: l.finalidade, desde: l.finalidade_desde! } : null,
      cartao:
        l.tipo === 'cartao'
          ? {
              diaFechamento: l.dia_fechamento!,
              diaVencimento: l.dia_vencimento!,
              proximaFatura: faturaDaCompra(
                dia,
                { diaFechamento: l.dia_fechamento!, diaVencimento: l.dia_vencimento! },
                reais,
              ),
            }
          : null,
    }));
  }

  async obterConta(id: string): Promise<Conta> {
    const [conta] = await this.listarContas(true, { id });
    if (!conta) throw new NotFoundException('Conta não encontrada');
    return conta;
  }

  async criarConta(
    autor: Autor,
    dados: {
      instituicaoId: string;
      nome: string;
      tipo: TipoDeConta;
      finalidade: Finalidade;
      finalidadeDesde?: Data;
      diaFechamento?: number;
      diaVencimento?: number;
    },
  ): Promise<Conta> {
    const id = await this.escrita
      .executar(autor, async (m) => {
        const [conta] = await m.query(
          `INSERT INTO conta (instituicao_id, nome, tipo, dia_fechamento, dia_vencimento)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [dados.instituicaoId, dados.nome, dados.tipo, dados.diaFechamento ?? null, dados.diaVencimento ?? null],
        );
        await m.query(`INSERT INTO conta_finalidade (conta_id, finalidade, vigente_de) VALUES ($1, $2, $3)`, [
          conta.id,
          dados.finalidade,
          dados.finalidadeDesde ?? DESDE_SEMPRE,
        ]);
        return conta.id as string;
      })
      .catch((e) => traduzirErroDoBanco(e, MENSAGENS));
    return this.obterConta(id);
  }

  async atualizarConta(
    autor: Autor,
    id: string,
    dados: { nome?: string; ativa?: boolean; diaFechamento?: number; diaVencimento?: number },
  ): Promise<Conta> {
    await this.escrita
      .executar(autor, async (m) => {
        const [atual] = await m.query(`SELECT tipo FROM conta WHERE id = $1 FOR UPDATE`, [id]);
        if (!atual) throw new NotFoundException('Conta não encontrada');
        if (atual.tipo !== 'cartao' && (dados.diaFechamento !== undefined || dados.diaVencimento !== undefined)) {
          throw new BadRequestException('Só cartão tem dia de fechamento e de vencimento');
        }
        await m.query(
          `UPDATE conta SET nome = coalesce($2, nome), ativa = coalesce($3, ativa),
             dia_fechamento = coalesce($4, dia_fechamento), dia_vencimento = coalesce($5, dia_vencimento),
             atualizado_em = now()
           WHERE id = $1`,
          [id, dados.nome ?? null, dados.ativa ?? null, dados.diaFechamento ?? null, dados.diaVencimento ?? null],
        );
      })
      .catch((e) => traduzirErroDoBanco(e, MENSAGENS));
    return this.obterConta(id);
  }

  // ----- Finalidade com vigência (RN-14) ---------------------------------------------

  async historicoDeFinalidade(contaId: string): Promise<VigenciaDeFinalidade[]> {
    await this.obterConta(contaId);
    return this.db.query(
      `SELECT id, finalidade, to_char(vigente_de, 'YYYY-MM-DD') AS "vigenteDe",
              to_char(vigente_ate, 'YYYY-MM-DD') AS "vigenteAte"
         FROM conta_finalidade WHERE conta_id = $1 ORDER BY vigente_de DESC`,
      [contaId],
    );
  }

  /** Finalidade vigente numa data: é o que as regras de saque, aporte e resgate consultam (RN-14). */
  async finalidadeEm(contaId: string, data: Data): Promise<Finalidade | null> {
    const [linha] = await this.db.query(
      `SELECT finalidade FROM conta_finalidade
        WHERE conta_id = $1 AND vigente_de <= $2 AND (vigente_ate IS NULL OR vigente_ate >= $2)`,
      [contaId, data],
    );
    return linha?.finalidade ?? null;
  }

  /**
   * Muda a finalidade a partir de uma data (HU-04 CA1): encerra a vigência atual na véspera
   * e abre uma nova. As datas anteriores continuam com a finalidade antiga.
   */
  async mudarFinalidade(
    autor: Autor,
    contaId: string,
    dados: { finalidade: Finalidade; vigenteDe: Data },
  ): Promise<VigenciaDeFinalidade[]> {
    await this.obterConta(contaId);
    await this.escrita
      .executar(autor, async (m: EntityManager) => {
        const [atual] = await m.query(
          `SELECT id, finalidade, to_char(vigente_de, 'YYYY-MM-DD') AS vigente_de
             FROM conta_finalidade WHERE conta_id = $1 AND vigente_ate IS NULL FOR UPDATE`,
          [contaId],
        );
        if (!atual) throw new ConflictException('A conta não tem finalidade vigente');
        if (atual.finalidade === dados.finalidade) {
          throw new BadRequestException(`A conta já tem a finalidade "${dados.finalidade}"`);
        }
        if (dados.vigenteDe <= atual.vigente_de) {
          throw new BadRequestException(`A nova finalidade precisa começar depois de ${atual.vigente_de}`);
        }
        await m.query(`UPDATE conta_finalidade SET vigente_ate = $2 WHERE id = $1`, [
          atual.id,
          somarDias(dados.vigenteDe, -1),
        ]);
        await m.query(`INSERT INTO conta_finalidade (conta_id, finalidade, vigente_de) VALUES ($1, $2, $3)`, [
          contaId,
          dados.finalidade,
          dados.vigenteDe,
        ]);
      })
      .catch((e) => traduzirErroDoBanco(e, MENSAGENS));
    return this.historicoDeFinalidade(contaId);
  }

  // ----- Fatura (HU-07) --------------------------------------------------------------

  async faturaDaCompra(contaId: string, dataCompra: Data): Promise<FaturaDaCompra> {
    const conta = await this.obterConta(contaId);
    if (!conta.cartao) throw new BadRequestException('Só cartão tem fatura');
    return faturaDaCompra(dataCompra, conta.cartao, await this.ciclos.datasReais());
  }
}
