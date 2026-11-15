import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { alterar } from '../comum/banco.js';
import { type Autor, Escrita } from '../auditoria/escrita.js';
import { type Data, hoje } from '../calendario/datas.js';
import { CiclosService } from '../calendario/ciclos.service.js';
import { cicloDaData, descreverCiclo, type DatasReais } from '../calendario/regras.js';
import { CadastrosService } from '../cadastros/cadastros.service.js';
import { ClassificacaoService, type Regra } from '../classificacao/classificacao.service.js';
import { type TipoDeTransacao, escolherRegra, tipoPeloSinal } from '../classificacao/regras.js';
import { centavosDoBanco, deCentavos } from '../comum/dinheiro.js';
import { CONFIG, type Config } from '../config/config.js';
import { FaturasService } from '../faturas/faturas.service.js';
import { faturaDaCompra } from '../faturas/regras.js';
import { type ItemDoLote, chaveDeDuplicata } from '../importacao/regras.js';

export type Origem = 'claude' | 'manual' | 'open_finance' | 'csv';

/** Transação a gravar, já com as datas de pagamento resolvidas. */
export interface NovaTransacao extends ItemDoLote {
  contaId: string | null;
  dataPagamento: Data;
  faturaId: string | null;
  categoriaId?: string | undefined;
  tipo?: TipoDeTransacao | undefined;
  compensaId?: string | undefined;
}

export interface ResultadoDaGravacao {
  ids: string[];
  duplicadas: number;
  semCategoria: number;
}

export interface Transacao {
  id: string;
  conta: { id: string; nome: string; instituicao: string; cor: string } | null;
  loteId: string | null;
  dataCompra: Data;
  dataPagamento: Data;
  ciclo: string;
  valor: string;
  descricao: string;
  descricaoOriginal: string;
  tipo: TipoDeTransacao;
  categoria: { id: string; nome: string; pai: string | null } | null;
  parcela: { numero: number; total: number } | null;
  origem: Origem;
  duplicata: { de: string } | null;
  compensaId: string | null;
  temAnotacao: boolean;
  excluidaEm: string | null;
}

export interface Filtro {
  ciclo?: string | undefined;
  contaId?: string | undefined;
  categoriaId?: string | undefined;
  loteId?: string | undefined;
  semCategoria?: boolean | undefined;
  texto?: string | undefined;
  excluidas?: boolean | undefined;
  limite?: number | undefined;
  pagina?: number | undefined;
}

/** Tipos que não pedem categoria: movimentam dinheiro entre contas suas. */
export const TIPOS_SEM_CATEGORIA: TipoDeTransacao[] = ['transferencia', 'pagamento_fatura'];

interface LinhaTransacao {
  id: string;
  conta_id: string | null;
  conta_nome: string | null;
  inst_nome: string | null;
  inst_cor: string | null;
  importacao_id: string | null;
  data_compra: string;
  data_pagamento: string;
  valor: string;
  descricao: string | null;
  descricao_original: string;
  tipo: TipoDeTransacao;
  categoria_id: string | null;
  categoria_nome: string | null;
  categoria_pai: string | null;
  parcela_numero: number | null;
  parcela_total: number | null;
  origem: Origem;
  duplicata: string | null;
  duplicata_de: string | null;
  compensa_id: string | null;
  tem_anotacao: boolean;
  deleted_at: Date | null;
}

export const SELECT_TRANSACAO = `
  SELECT t.id, t.conta_id, c.nome AS conta_nome, i.nome AS inst_nome, i.cor AS inst_cor, t.importacao_id,
         to_char(t.data_compra, 'YYYY-MM-DD') AS data_compra, to_char(t.data_pagamento, 'YYYY-MM-DD') AS data_pagamento,
         t.valor, t.descricao, t.descricao_original, t.tipo, t.categoria_id,
         cat.nome AS categoria_nome, pai.nome AS categoria_pai, t.parcela_numero, t.parcela_total, t.origem,
         t.duplicata, t.duplicata_de, t.compensa_id, t.anotacao IS NOT NULL AS tem_anotacao, t.deleted_at
    FROM transacao t
    LEFT JOIN conta c ON c.id = t.conta_id
    LEFT JOIN instituicao i ON i.id = c.instituicao_id
    LEFT JOIN categoria cat ON cat.id = t.categoria_id
    LEFT JOIN categoria pai ON pai.id = cat.pai_id`;

@Injectable()
export class TransacoesService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(Escrita) private readonly escrita: Escrita,
    @Inject(CiclosService) private readonly ciclos: CiclosService,
    @Inject(CadastrosService) private readonly cadastros: CadastrosService,
    @Inject(ClassificacaoService) private readonly classificacao: ClassificacaoService,
    @Inject(FaturasService) private readonly faturas: FaturasService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /**
   * Grava transações dentro de uma transação de banco já aberta com autor.
   * Aplica as regras de categorização (HU-12 CA2) e marca possíveis duplicatas sem descartar
   * nada (D2): iguais a uma já gravada, ou repetidas dentro do próprio lote.
   */
  async gravar(
    m: EntityManager,
    itens: readonly NovaTransacao[],
    origem: Origem,
    importacaoId: string | null,
    regras?: Regra[],
  ): Promise<ResultadoDaGravacao> {
    const ativas = regras ?? (await this.classificacao.regrasAtivas(m));
    const vistas = new Map<string, string>();
    const resultado: ResultadoDaGravacao = { ids: [], duplicadas: 0, semCategoria: 0 };

    for (const item of itens) {
      if (item.categoriaId) await this.classificacao.exigirCategoriaAtiva(m, item.categoriaId);
      const chave = chaveDeDuplicata(item.contaId, item);
      let original = vistas.get(chave);
      if (!original) {
        const [existente] = await m.query(
          `SELECT id FROM transacao WHERE chave_duplicata = $1 AND deleted_at IS NULL ORDER BY criado_em LIMIT 1`,
          [chave],
        );
        original = existente?.id;
      }

      const regra =
        item.categoriaId && item.tipo
          ? null
          : escolherRegra(ativas, { descricao: item.descricao, contaId: item.contaId, centavos: item.centavos });
      const tipo = item.tipo ?? regra?.tipo ?? tipoPeloSinal(item.centavos);
      const categoriaId = TIPOS_SEM_CATEGORIA.includes(tipo) ? null : (item.categoriaId ?? regra?.categoriaId ?? null);

      const [linha] = await m.query(
        `INSERT INTO transacao (conta_id, importacao_id, fatura_id, data_compra, data_pagamento, valor,
           descricao_original, tipo, categoria_id, parcela_numero, parcela_total, origem, chave_duplicata,
           duplicata, duplicata_de, compensa_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
        [
          item.contaId,
          importacaoId,
          item.faturaId,
          item.data,
          item.dataPagamento,
          deCentavos(item.centavos),
          item.descricao,
          tipo,
          categoriaId,
          item.parcela?.numero ?? null,
          item.parcela?.total ?? null,
          origem,
          chave,
          original ? 'suspeita' : null,
          original ?? null,
          item.compensaId ?? null,
        ],
      );
      vistas.set(chave, original ?? linha.id);
      resultado.ids.push(linha.id);
      if (original) resultado.duplicadas++;
      if (!categoriaId && !TIPOS_SEM_CATEGORIA.includes(tipo)) resultado.semCategoria++;
    }
    return resultado;
  }

  /**
   * Data de pagamento e fatura de uma compra (RN-08): no cartão, o vencimento da fatura;
   * nas demais contas, a própria data.
   */
  async resolverPagamento(
    m: EntityManager,
    contaId: string | null,
    data: Data,
    reais: DatasReais,
    fatura?: { fechamento: Data; vencimento: Data },
  ): Promise<{ dataPagamento: Data; faturaId: string | null }> {
    if (!contaId) return { dataPagamento: data, faturaId: null };
    const conta = await this.cadastros.obterConta(contaId);
    if (!conta.cartao) return { dataPagamento: data, faturaId: null };
    const f = fatura ?? faturaDaCompra(data, conta.cartao, reais);
    return { dataPagamento: f.vencimento, faturaId: await this.faturas.garantir(m, contaId, f.fechamento, f.vencimento, hoje()) };
  }

  // ----- Lançamento manual (HU-10, UC-09) --------------------------------------------

  async lancar(
    autor: Autor,
    dados: {
      contaId?: string | undefined;
      data: Data;
      centavos: number;
      descricao: string;
      tipo?: TipoDeTransacao | undefined;
      categoriaId?: string | undefined;
      compensaId?: string | undefined;
    },
  ): Promise<Transacao> {
    const foraDasContas = dados.tipo === 'receita_fora_das_contas';
    if (foraDasContas && dados.contaId) throw new BadRequestException('Receita fora das contas não tem conta (D3)');
    if (!foraDasContas && !dados.contaId) throw new BadRequestException('Informe a conta');
    if (foraDasContas && dados.centavos <= 0) throw new BadRequestException('Receita fora das contas é sempre positiva');
    if (dados.contaId) {
      const conta = await this.cadastros.obterConta(dados.contaId);
      if (!conta.ativa || !conta.instituicao.ativa) throw new BadRequestException('Conta inativa');
    }

    const origem: Origem = autor === 'claude' ? 'claude' : 'manual';
    const reais = await this.ciclos.datasReais();
    const [id] = await this.escrita.executar(autor, async (m) => {
      if (dados.compensaId) {
        const [alvo] = await m.query(`SELECT 1 FROM transacao WHERE id = $1 AND deleted_at IS NULL`, [dados.compensaId]);
        if (!alvo) throw new NotFoundException('Transação compensada não encontrada');
      }
      const pagamento = await this.resolverPagamento(m, dados.contaId ?? null, dados.data, reais);
      const r = await this.gravar(
        m,
        [
          {
            contaId: dados.contaId ?? null,
            data: dados.data,
            centavos: dados.centavos,
            descricao: dados.descricao,
            tipo: dados.tipo,
            categoriaId: dados.categoriaId,
            compensaId: dados.compensaId,
            ...pagamento,
          },
        ],
        origem,
        null,
      );
      return r.ids;
    });
    return this.obter(id!);
  }

  // ----- Consulta ----------------------------------------------------------------------

  async obter(id: string): Promise<Transacao> {
    const [linha] = await this.db.query(`${SELECT_TRANSACAO} WHERE t.id = $1`, [id]);
    if (!linha) throw new NotFoundException('Transação não encontrada');
    return this.paraApi(linha, await this.ciclos.datasReais());
  }

  async consultar(filtro: Filtro): Promise<{ transacoes: Transacao[]; total: number; soma: string }> {
    const reais = await this.ciclos.datasReais();
    const condicoes: string[] = [filtro.excluidas ? 't.deleted_at IS NOT NULL' : 't.deleted_at IS NULL'];
    const params: unknown[] = [];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    if (filtro.ciclo) {
      const c = descreverCiclo(filtro.ciclo, reais);
      condicoes.push(`t.data_pagamento BETWEEN ${p(c.inicio)} AND ${p(c.fim)}`);
    }
    if (filtro.contaId) condicoes.push(`t.conta_id = ${p(filtro.contaId)}`);
    if (filtro.categoriaId) condicoes.push(`(t.categoria_id = ${p(filtro.categoriaId)} OR cat.pai_id = $${params.length})`);
    if (filtro.loteId) condicoes.push(`t.importacao_id = ${p(filtro.loteId)}`);
    if (filtro.semCategoria) {
      condicoes.push(`t.categoria_id IS NULL AND t.tipo <> ALL(${p(TIPOS_SEM_CATEGORIA)})`);
    }
    if (filtro.texto) {
      condicoes.push(`(coalesce(t.descricao, t.descricao_original) ILIKE ${p(`%${filtro.texto.replace(/[\\%_]/g, '\\$&')}%`)}
        OR t.descricao_original ILIKE $${params.length})`);
    }
    const onde = condicoes.join(' AND ');
    const limite = Math.min(filtro.limite ?? 100, 500);
    const deslocamento = ((filtro.pagina ?? 1) - 1) * limite;
    const [linhas, [resumo]] = await Promise.all([
      this.db.query(
        `${SELECT_TRANSACAO} WHERE ${onde} ORDER BY t.data_pagamento DESC, t.data_compra DESC, t.criado_em DESC
         LIMIT ${limite} OFFSET ${deslocamento}`,
        params,
      ),
      this.db.query(
        `SELECT count(*)::int AS total, coalesce(sum(t.valor), 0)::text AS soma
           FROM transacao t LEFT JOIN categoria cat ON cat.id = t.categoria_id WHERE ${onde}`,
        params,
      ),
    ]);
    return {
      transacoes: linhas.map((l: LinhaTransacao) => this.paraApi(l, reais)),
      total: resumo.total,
      soma: deCentavos(centavosDoBanco(resumo.soma) ?? 0),
    };
  }

  paraApi(l: LinhaTransacao, reais: DatasReais): Transacao {
    return {
      id: l.id,
      conta: l.conta_id ? { id: l.conta_id, nome: l.conta_nome!, instituicao: l.inst_nome!, cor: l.inst_cor! } : null,
      loteId: l.importacao_id,
      dataCompra: l.data_compra,
      dataPagamento: l.data_pagamento,
      ciclo: cicloDaData(l.data_pagamento, reais),
      valor: deCentavos(centavosDoBanco(l.valor)!),
      descricao: l.descricao ?? l.descricao_original,
      descricaoOriginal: l.descricao_original,
      tipo: l.tipo,
      categoria: l.categoria_id ? { id: l.categoria_id, nome: l.categoria_nome!, pai: l.categoria_pai } : null,
      parcela: l.parcela_numero ? { numero: l.parcela_numero, total: l.parcela_total! } : null,
      origem: l.origem,
      duplicata: l.duplicata === 'suspeita' ? { de: l.duplicata_de! } : null,
      compensaId: l.compensa_id,
      temAnotacao: l.tem_anotacao,
      excluidaEm: l.deleted_at ? new Date(l.deleted_at).toISOString() : null,
    };
  }

  // ----- Edição, exclusão lógica e anotação (HU-14) ----------------------------------

  /**
   * Muda descrição, categoria, tipo, valor ou data da compra. Valor e data só pela tela, pelo
   * Matheus (SAD DM-18, revisado em 15/11): o Claude corrige erro de leitura desfazendo o lote.
   * Mudar a data recalcula o pagamento e a fatura (RN-08), exceto em item de lote de fatura
   * de cartão, que continua na fatura do documento. A auditoria guarda o antes e o depois.
   */
  async editar(
    autor: Autor,
    id: string,
    dados: {
      descricao?: string | null;
      categoriaId?: string | null;
      tipo?: TipoDeTransacao;
      data?: Data;
      centavos?: number;
    },
  ): Promise<Transacao> {
    const mudaValorOuData = dados.data !== undefined || dados.centavos !== undefined;
    if (mudaValorOuData && autor === 'claude') {
      throw new ForbiddenException('Valor e data só mudam pela tela; erro de leitura se corrige desfazendo o lote');
    }
    const reais = mudaValorOuData ? await this.ciclos.datasReais() : null;
    await this.escrita.executar(autor, async (m) => {
      const [atual] = await m.query(
        `SELECT t.tipo, t.deleted_at, t.conta_id, to_char(t.data_compra, 'YYYY-MM-DD') AS data_compra,
                to_char(t.data_pagamento, 'YYYY-MM-DD') AS data_pagamento, t.fatura_id, t.valor,
                t.descricao_original, t.parcela_numero, t.parcela_total, i.fatura_id AS fatura_do_lote
           FROM transacao t LEFT JOIN importacao i ON i.id = t.importacao_id
          WHERE t.id = $1 FOR UPDATE OF t`,
        [id],
      );
      if (!atual) throw new NotFoundException('Transação não encontrada');
      if (atual.deleted_at) throw new ConflictException('A transação está na lixeira; restaure antes de editar');
      const tipo: TipoDeTransacao = dados.tipo ?? atual.tipo;
      if ((tipo === 'receita_fora_das_contas') !== (atual.tipo === 'receita_fora_das_contas')) {
        throw new BadRequestException('Receita fora das contas não troca de tipo');
      }
      if (dados.categoriaId) await this.classificacao.exigirCategoriaAtiva(m, dados.categoriaId);
      const limparCategoria = TIPOS_SEM_CATEGORIA.includes(tipo);

      const data: Data = dados.data ?? atual.data_compra;
      const centavos = dados.centavos ?? centavosDoBanco(atual.valor)!;
      if (tipo === 'receita_fora_das_contas' && centavos <= 0) {
        throw new BadRequestException('Receita fora das contas é sempre positiva');
      }
      let pagamento = { dataPagamento: atual.data_pagamento as Data, faturaId: atual.fatura_id as string | null };
      if (data !== atual.data_compra && !atual.fatura_do_lote) {
        pagamento = await this.resolverPagamento(m, atual.conta_id, data, reais!);
      }
      const chave = chaveDeDuplicata(atual.conta_id, {
        data,
        centavos,
        descricao: atual.descricao_original,
        parcela: atual.parcela_numero ? { numero: atual.parcela_numero, total: atual.parcela_total } : undefined,
      });

      await m.query(
        `UPDATE transacao SET
           descricao = CASE WHEN $2 THEN $3 ELSE descricao END,
           categoria_id = CASE WHEN $7 THEN NULL WHEN $4 THEN $5 ELSE categoria_id END,
           tipo = $6, data_compra = $8, data_pagamento = $9, fatura_id = $10, valor = $11,
           chave_duplicata = $12, atualizado_em = now()
         WHERE id = $1`,
        [
          id,
          dados.descricao !== undefined,
          dados.descricao ?? null,
          dados.categoriaId !== undefined,
          dados.categoriaId ?? null,
          tipo,
          limparCategoria,
          data,
          pagamento.dataPagamento,
          pagamento.faturaId,
          deCentavos(centavos),
          chave,
        ],
      );
    });
    return this.obter(id);
  }

  async excluir(autor: Autor, id: string): Promise<Transacao> {
    await this.escrita.executar(autor, async (m) => {
      const linhas = await alterar(
        m,
        `UPDATE transacao SET deleted_at = now(), atualizado_em = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
        [id],
      );
      if (!linhas.length) throw new NotFoundException('Transação não encontrada ou já na lixeira');
    });
    return this.obter(id);
  }

  async restaurar(autor: Autor, id: string): Promise<Transacao> {
    await this.escrita.executar(autor, async (m) => {
      const [t] = await m.query(
        `SELECT t.deleted_at, i.status FROM transacao t LEFT JOIN importacao i ON i.id = t.importacao_id WHERE t.id = $1`,
        [id],
      );
      if (!t?.deleted_at) throw new NotFoundException('Transação não encontrada na lixeira');
      if (t.status === 'desfeito') throw new ConflictException('O lote desta transação foi desfeito; reimporte o lote');
      await m.query(`UPDATE transacao SET deleted_at = NULL, atualizado_em = now() WHERE id = $1`, [id]);
    });
    return this.obter(id);
  }

  /** Anotação livre, guardada criptografada com pgp_sym_encrypt (PRD §9.4). Texto vazio apaga. */
  async anotar(autor: Autor, id: string, texto: string): Promise<{ anotacao: string | null }> {
    await this.escrita.executar(autor, async (m) => {
      const linhas = await alterar(
        m,
        `UPDATE transacao SET anotacao = CASE WHEN $2 = '' THEN NULL ELSE pgp_sym_encrypt($2, $3) END,
           atualizado_em = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
        [id, texto.trim(), this.config.pgcryptoKey],
      );
      if (!linhas.length) throw new NotFoundException('Transação não encontrada');
    });
    return this.lerAnotacao(id);
  }

  async lerAnotacao(id: string): Promise<{ anotacao: string | null }> {
    const [l] = await this.db.query(
      `SELECT CASE WHEN anotacao IS NULL THEN NULL ELSE pgp_sym_decrypt(anotacao, $2) END AS anotacao
         FROM transacao WHERE id = $1`,
      [id, this.config.pgcryptoKey],
    );
    if (!l) throw new NotFoundException('Transação não encontrada');
    return { anotacao: l.anotacao };
  }
}
