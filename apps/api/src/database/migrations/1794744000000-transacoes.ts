import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marco de 14/12 (v0.3.0): categorias e regras (HU-12), faturas, lotes de importação (HU-08, HU-09),
 * transações com exclusão lógica (HU-10, HU-14) e marcação de possíveis duplicatas (D2, HU-13).
 */
export class Transacoes1794744000000 implements MigrationInterface {
  name = 'Transacoes1794744000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE categoria (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        nome          text NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 60),
        pai_id        uuid REFERENCES categoria (id),
        natureza      text CHECK (natureza IN ('intermitente', 'parcelada', 'pontual', 'flexivel')),
        ativa         boolean NOT NULL DEFAULT true,
        criado_em     timestamptz NOT NULL DEFAULT now(),
        atualizado_em timestamptz NOT NULL DEFAULT now(),
        CHECK (pai_id IS NULL OR pai_id <> id)
      )
    `);
    await q.query(`CREATE UNIQUE INDEX categoria_nome_unico ON categoria (coalesce(pai_id::text, ''), lower(nome))`);

    await q.query(`
      CREATE TABLE regra_categorizacao (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        padrao        text NOT NULL CHECK (length(btrim(padrao)) BETWEEN 2 AND 100),
        conta_id      uuid REFERENCES conta (id),
        valor_minimo  numeric(12,2) CHECK (valor_minimo >= 0),
        valor_maximo  numeric(12,2) CHECK (valor_maximo >= 0),
        categoria_id  uuid REFERENCES categoria (id),
        tipo          text CHECK (tipo IN ('receita', 'despesa', 'transferencia', 'pagamento_fatura')),
        prioridade    integer NOT NULL DEFAULT 0,
        ativa         boolean NOT NULL DEFAULT true,
        criado_em     timestamptz NOT NULL DEFAULT now(),
        atualizado_em timestamptz NOT NULL DEFAULT now(),
        CHECK (categoria_id IS NOT NULL OR tipo IS NOT NULL),
        CHECK (valor_minimo IS NULL OR valor_maximo IS NULL OR valor_minimo <= valor_maximo)
      )
    `);

    await q.query(`
      CREATE TABLE fatura (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        conta_id      uuid NOT NULL REFERENCES conta (id),
        fechamento    date NOT NULL,
        vencimento    date NOT NULL CHECK (vencimento > fechamento),
        status        text NOT NULL DEFAULT 'aberta'
                        CHECK (status IN ('aberta', 'fechada', 'paga', 'parcialmente_paga')),
        criado_em     timestamptz NOT NULL DEFAULT now(),
        atualizado_em timestamptz NOT NULL DEFAULT now(),
        UNIQUE (conta_id, vencimento)
      )
    `);

    await q.query(`
      CREATE TABLE importacao (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        fonte           text NOT NULL CHECK (fonte IN ('claude', 'manual', 'open_finance')),
        conta_id        uuid NOT NULL REFERENCES conta (id),
        documento       text NOT NULL CHECK (length(btrim(documento)) BETWEEN 1 AND 200),
        periodo_de      date NOT NULL,
        periodo_ate     date NOT NULL CHECK (periodo_ate >= periodo_de),
        fatura_id       uuid REFERENCES fatura (id),
        total_declarado numeric(12,2),
        saldo_inicial   numeric(12,2),
        saldo_final     numeric(12,2),
        conferencia     text NOT NULL CHECK (conferencia IN ('total', 'saldo', 'nenhuma')),
        hash            text NOT NULL,
        status          text NOT NULL CHECK (status IN ('aceito', 'nao_conferido', 'desfeito')),
        itens           integer NOT NULL,
        novas           integer NOT NULL,
        duplicadas      integer NOT NULL,
        criado_em       timestamptz NOT NULL DEFAULT now(),
        atualizado_em   timestamptz NOT NULL DEFAULT now(),
        CHECK ((saldo_inicial IS NULL) = (saldo_final IS NULL))
      )
    `);
    // QA-05: o mesmo conteúdo só entra uma vez enquanto o lote não for desfeito.
    await q.query(`CREATE UNIQUE INDEX importacao_hash_unico ON importacao (hash) WHERE status <> 'desfeito'`);

    await q.query(`
      CREATE TABLE transacao (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        conta_id           uuid REFERENCES conta (id),
        importacao_id      uuid REFERENCES importacao (id),
        fatura_id          uuid REFERENCES fatura (id),
        data_compra        date NOT NULL,
        data_pagamento     date NOT NULL,
        valor              numeric(12,2) NOT NULL CHECK (valor <> 0),
        descricao_original text NOT NULL CHECK (length(descricao_original) BETWEEN 1 AND 300),
        descricao          text CHECK (descricao IS NULL OR length(descricao) BETWEEN 1 AND 300),
        tipo               text NOT NULL
                             CHECK (tipo IN ('receita', 'despesa', 'transferencia', 'pagamento_fatura', 'receita_fora_das_contas')),
        categoria_id       uuid REFERENCES categoria (id),
        parcela_numero     smallint,
        parcela_total      smallint,
        origem             text NOT NULL CHECK (origem IN ('claude', 'manual', 'open_finance', 'csv')),
        chave_duplicata    text NOT NULL,
        duplicata          text CHECK (duplicata IN ('suspeita', 'nao_e')),
        duplicata_de       uuid REFERENCES transacao (id),
        compensa_id        uuid REFERENCES transacao (id),
        anotacao           bytea,
        deleted_at         timestamptz,
        criado_em          timestamptz NOT NULL DEFAULT now(),
        atualizado_em      timestamptz NOT NULL DEFAULT now(),
        CHECK ((parcela_numero IS NULL) = (parcela_total IS NULL)),
        CHECK (parcela_total IS NULL OR (parcela_numero BETWEEN 1 AND parcela_total AND parcela_total <= 120)),
        -- D3: só a receita fora das contas não tem conta (ex.: a metade da faculdade paga pela mãe).
        CHECK ((conta_id IS NULL) = (tipo = 'receita_fora_das_contas')),
        CHECK (tipo <> 'receita_fora_das_contas' OR valor > 0),
        CHECK (duplicata IS DISTINCT FROM 'suspeita' OR duplicata_de IS NOT NULL)
      )
    `);
    await q.query(`CREATE INDEX transacao_pagamento_idx ON transacao (data_pagamento) WHERE deleted_at IS NULL`);
    await q.query(`CREATE INDEX transacao_compra_idx ON transacao (data_compra) WHERE deleted_at IS NULL`);
    await q.query(`CREATE INDEX transacao_chave_idx ON transacao (chave_duplicata) WHERE deleted_at IS NULL`);
    await q.query(`CREATE INDEX transacao_importacao_idx ON transacao (importacao_id)`);

    for (const tabela of ['categoria', 'regra_categorizacao', 'fatura', 'importacao', 'transacao']) {
      await q.query(
        `CREATE TRIGGER ${tabela}_auditada AFTER INSERT OR UPDATE OR DELETE ON ${tabela}
         FOR EACH ROW EXECUTE FUNCTION auditar()`,
      );
    }
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE transacao, importacao, fatura, regra_categorizacao, categoria`);
  }
}
