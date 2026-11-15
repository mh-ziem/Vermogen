import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * O TypeORM exige o instante (em milissegundos) no nome da classe; é ele que define a ordem.
 * Extensão pgcrypto e tabelas de login (HU-01).
 */
export class Inicial1794657600000 implements MigrationInterface {
  name = 'Inicial1794657600000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    await q.query(`
      CREATE TABLE usuario (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        nome          text NOT NULL UNIQUE,
        senha_hash    text NOT NULL,
        criado_em     timestamptz NOT NULL DEFAULT now(),
        atualizado_em timestamptz NOT NULL DEFAULT now()
      )
    `);

    await q.query(`
      CREATE TABLE sessao (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        usuario_id    uuid NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
        token_hash    bytea NOT NULL UNIQUE,
        dispositivo   text,
        criado_em     timestamptz NOT NULL DEFAULT now(),
        ultimo_uso_em timestamptz NOT NULL DEFAULT now(),
        expira_em     timestamptz NOT NULL
      )
    `);
    await q.query(`CREATE INDEX sessao_expira_em_idx ON sessao (expira_em)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE sessao`);
    await q.query(`DROP TABLE usuario`);
  }
}
