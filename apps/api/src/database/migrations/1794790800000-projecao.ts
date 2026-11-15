import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marco de 29/12 (v1.0.0): parâmetros da projeção, valor fixo das intermitentes (RN-10), plano do
 * ciclo definido na abertura e projeção congelada (HU-15 a HU-17). SAD DT-08 e DM-26.
 * Vigência por ciclo: o valor vale do ciclo `a_partir_de` em diante, até o próximo registro.
 */
export class Projecao1794790800000 implements MigrationInterface {
  name = 'Projecao1794790800000';

  async up(q: QueryRunner): Promise<void> {
    const ciclo = `CHECK (%s ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')`;
    await q.query(`
      CREATE TABLE parametro (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        nome          text NOT NULL CHECK (nome IN ('salario', 'aporte_percentual', 'orcamento_flexiveis', 'folga_minima')),
        a_partir_de   text NOT NULL ${ciclo.replace('%s', 'a_partir_de')},
        valor         numeric(12,2) NOT NULL CHECK (valor >= 0),
        atualizado_em timestamptz NOT NULL DEFAULT now(),
        UNIQUE (nome, a_partir_de),
        CHECK (nome <> 'aporte_percentual' OR valor <= 100)
      )
    `);
    await q.query(`
      CREATE TABLE orcamento (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        categoria_id  uuid NOT NULL REFERENCES categoria (id),
        a_partir_de   text NOT NULL ${ciclo.replace('%s', 'a_partir_de')},
        valor         numeric(12,2) CHECK (valor >= 0),
        atualizado_em timestamptz NOT NULL DEFAULT now(),
        UNIQUE (categoria_id, a_partir_de)
      )
    `);
    await q.query(`
      CREATE TABLE plano_ciclo (
        id                  text PRIMARY KEY ${ciclo.replace('%s', 'id')},
        aporte              numeric(12,2) NOT NULL CHECK (aporte >= 0),
        orcamento_flexiveis numeric(12,2) NOT NULL CHECK (orcamento_flexiveis >= 0),
        atualizado_em       timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`
      CREATE TABLE snapshot_projecao (
        id                  text PRIMARY KEY ${ciclo.replace('%s', 'id')},
        congelado_em        timestamptz NOT NULL DEFAULT now(),
        incompleto          boolean NOT NULL,
        lotes_aceitos       integer NOT NULL,
        contas_esperadas    integer NOT NULL,
        pendencias          integer NOT NULL,
        resultado_liquido   numeric(12,2) NOT NULL,
        aporte              numeric(12,2) NOT NULL,
        orcamento_flexiveis numeric(12,2) NOT NULL,
        detalhe             jsonb NOT NULL,
        atualizado_em       timestamptz NOT NULL DEFAULT now()
      )
    `);
    for (const tabela of ['parametro', 'orcamento', 'plano_ciclo', 'snapshot_projecao']) {
      await q.query(
        `CREATE TRIGGER ${tabela}_auditada AFTER INSERT OR UPDATE OR DELETE ON ${tabela}
         FOR EACH ROW EXECUTE FUNCTION auditar()`,
      );
    }
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE snapshot_projecao, plano_ciclo, orcamento, parametro`);
  }
}
