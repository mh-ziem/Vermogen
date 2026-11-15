import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { alterar } from '../comum/banco.js';
import { type Autor, Escrita } from '../auditoria/escrita.js';
import { centavosDoBanco, deCentavos } from '../comum/dinheiro.js';
import { traduzirErroDoBanco } from '../comum/erros.js';
import type { RegraDeCategorizacao, TipoDeTransacao } from './regras.js';

export type Natureza = 'intermitente' | 'parcelada' | 'pontual' | 'flexivel';

export interface Categoria {
  id: string;
  nome: string;
  paiId: string | null;
  natureza: Natureza | null;
  ativa: boolean;
}

export interface Regra extends RegraDeCategorizacao {
  ativa: boolean;
}

/** Regra como sai na API: valores em reais (texto decimal), não em centavos. */
export interface RegraNaApi extends Omit<Regra, 'valorMinimo' | 'valorMaximo'> {
  valorMinimo: string | null;
  valorMaximo: string | null;
}

const MENSAGENS = {
  categoria_nome_unico: 'Já existe uma categoria com esse nome nesse nível',
  categoria_pai_id_fkey: 'Categoria-pai não encontrada',
  regra_categorizacao_categoria_id_fkey: 'Categoria não encontrada',
  regra_categorizacao_conta_id_fkey: 'Conta não encontrada',
};

interface LinhaRegra {
  id: string;
  padrao: string;
  conta_id: string | null;
  valor_minimo: string | null;
  valor_maximo: string | null;
  categoria_id: string | null;
  tipo: TipoDeTransacao | null;
  prioridade: number;
  ativa: boolean;
}

function regraDaLinha(l: LinhaRegra): Regra {
  return {
    id: l.id,
    padrao: l.padrao,
    contaId: l.conta_id,
    valorMinimo: centavosDoBanco(l.valor_minimo),
    valorMaximo: centavosDoBanco(l.valor_maximo),
    categoriaId: l.categoria_id,
    tipo: l.tipo,
    prioridade: l.prioridade,
    ativa: l.ativa,
  };
}

export function regraNaApi(r: Regra): RegraNaApi {
  return {
    ...r,
    valorMinimo: r.valorMinimo === null ? null : deCentavos(r.valorMinimo),
    valorMaximo: r.valorMaximo === null ? null : deCentavos(r.valorMaximo),
  };
}

@Injectable()
export class ClassificacaoService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(Escrita) private readonly escrita: Escrita,
  ) {}

  // ----- Categorias ------------------------------------------------------------------

  async listarCategorias(incluirInativas = false): Promise<Categoria[]> {
    return this.db.query(
      `SELECT c.id, c.nome, c.pai_id AS "paiId", c.natureza, c.ativa
         FROM categoria c LEFT JOIN categoria p ON p.id = c.pai_id
        WHERE c.ativa OR $1
        ORDER BY lower(coalesce(p.nome, c.nome)), c.pai_id IS NOT NULL, lower(c.nome)`,
      [incluirInativas],
    );
  }

  async criarCategoria(autor: Autor, dados: { nome: string; paiId?: string; natureza?: Natureza }): Promise<Categoria> {
    return this.escrita
      .executar(autor, async (m) => {
        if (dados.paiId) await this.exigirCategoriaRaiz(m, dados.paiId);
        const [c] = await m.query(
          `INSERT INTO categoria (nome, pai_id, natureza) VALUES ($1, $2, $3)
           RETURNING id, nome, pai_id AS "paiId", natureza, ativa`,
          [dados.nome, dados.paiId ?? null, dados.natureza ?? null],
        );
        return c as Categoria;
      })
      .catch((e) => traduzirErroDoBanco(e, MENSAGENS));
  }

  async atualizarCategoria(
    autor: Autor,
    id: string,
    dados: { nome?: string; natureza?: Natureza | null; ativa?: boolean },
  ): Promise<Categoria> {
    const c = await this.escrita
      .executar(autor, async (m) => {
        const [r] = await alterar<Categoria>(
          m,
          `UPDATE categoria SET nome = coalesce($2, nome),
             natureza = CASE WHEN $3 THEN $4 ELSE natureza END,
             ativa = coalesce($5, ativa), atualizado_em = now()
           WHERE id = $1 RETURNING id, nome, pai_id AS "paiId", natureza, ativa`,
          [id, dados.nome ?? null, dados.natureza !== undefined, dados.natureza ?? null, dados.ativa ?? null],
        );
        return r;
      })
      .catch((e) => traduzirErroDoBanco(e, MENSAGENS));
    if (!c) throw new NotFoundException('Categoria não encontrada');
    return c;
  }

  /** A árvore tem dois níveis: categoria e subcategoria (PRD §9.4). */
  private async exigirCategoriaRaiz(m: EntityManager, id: string): Promise<void> {
    const [pai] = await m.query(`SELECT pai_id FROM categoria WHERE id = $1`, [id]);
    if (!pai) throw new NotFoundException('Categoria-pai não encontrada');
    if (pai.pai_id) throw new BadRequestException('A categoria-pai precisa ser de primeiro nível');
  }

  async exigirCategoriaAtiva(m: EntityManager | DataSource, id: string): Promise<void> {
    const [c] = await m.query(`SELECT ativa FROM categoria WHERE id = $1`, [id]);
    if (!c) throw new NotFoundException(`Categoria não encontrada: ${id}`);
    if (!c.ativa) throw new BadRequestException('Categoria inativa');
  }

  // ----- Regras (HU-12) --------------------------------------------------------------

  async listarRegras(): Promise<RegraNaApi[]> {
    const linhas: LinhaRegra[] = await this.db.query(
      `SELECT * FROM regra_categorizacao ORDER BY ativa DESC, prioridade DESC, lower(padrao)`,
    );
    return linhas.map((l) => regraNaApi(regraDaLinha(l)));
  }

  /** Regras ativas, para aplicar na importação e no lançamento (HU-12 CA2). */
  async regrasAtivas(m: EntityManager | DataSource = this.db): Promise<Regra[]> {
    const linhas: LinhaRegra[] = await m.query(`SELECT * FROM regra_categorizacao WHERE ativa`);
    return linhas.map(regraDaLinha);
  }

  async criarRegra(
    autor: Autor,
    dados: {
      padrao: string;
      contaId?: string;
      valorMinimo?: number;
      valorMaximo?: number;
      categoriaId?: string;
      tipo?: TipoDeTransacao;
      prioridade?: number;
    },
    m?: EntityManager,
  ): Promise<RegraNaApi> {
    const gravar = async (t: EntityManager) => {
      if (dados.categoriaId) await this.exigirCategoriaAtiva(t, dados.categoriaId);
      const [l] = await t.query(
        `INSERT INTO regra_categorizacao (padrao, conta_id, valor_minimo, valor_maximo, categoria_id, tipo, prioridade)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          dados.padrao,
          dados.contaId ?? null,
          dados.valorMinimo === undefined ? null : deCentavos(dados.valorMinimo),
          dados.valorMaximo === undefined ? null : deCentavos(dados.valorMaximo),
          dados.categoriaId ?? null,
          dados.tipo ?? null,
          dados.prioridade ?? 0,
        ],
      );
      return regraNaApi(regraDaLinha(l));
    };
    return (m ? gravar(m) : this.escrita.executar(autor, gravar)).catch((e) => traduzirErroDoBanco(e, MENSAGENS));
  }

  async atualizarRegra(
    autor: Autor,
    id: string,
    dados: { prioridade?: number; ativa?: boolean; categoriaId?: string },
  ): Promise<RegraNaApi> {
    const l = await this.escrita
      .executar(autor, async (m) => {
        if (dados.categoriaId) await this.exigirCategoriaAtiva(m, dados.categoriaId);
        const [r] = await alterar<LinhaRegra>(
          m,
          `UPDATE regra_categorizacao SET prioridade = coalesce($2, prioridade), ativa = coalesce($3, ativa),
             categoria_id = coalesce($4, categoria_id), atualizado_em = now()
           WHERE id = $1 RETURNING *`,
          [id, dados.prioridade ?? null, dados.ativa ?? null, dados.categoriaId ?? null],
        );
        return r;
      })
      .catch((e) => traduzirErroDoBanco(e, MENSAGENS));
    if (!l) throw new NotFoundException('Regra não encontrada');
    return regraNaApi(regraDaLinha(l));
  }
}
