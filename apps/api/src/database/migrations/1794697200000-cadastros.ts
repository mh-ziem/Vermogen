import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marco de 30/11 (v0.2.0): auditoria por gatilho com autor obrigatório (DT-09),
 * instituições, contas, finalidade com vigência (HU-03 a HU-05, RN-14),
 * datas reais do salário (RN-04) e tokens do MCP (DT-11).
 */
export class Cadastros1794697200000 implements MigrationInterface {
  name = 'Cadastros1794697200000';

  async up(q: QueryRunner): Promise<void> {
    // Necessária para a restrição que impede duas finalidades vigentes na mesma data.
    await q.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);

    // ----- Auditoria (DT-09) -----------------------------------------------------------
    await q.query(`
      CREATE TABLE auditoria (
        id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        quando        timestamptz NOT NULL DEFAULT now(),
        autor         text NOT NULL CHECK (autor IN ('matheus', 'claude', 'sistema')),
        tabela        text NOT NULL,
        registro_id   text NOT NULL,
        operacao      text NOT NULL CHECK (operacao IN ('INSERT', 'UPDATE', 'DELETE')),
        antes         jsonb,
        depois        jsonb,
        revisado      boolean NOT NULL DEFAULT false,
        revertido_por bigint REFERENCES auditoria (id)
      )
    `);
    await q.query(`CREATE INDEX auditoria_registro_idx ON auditoria (tabela, registro_id)`);

    // Grava o antes e o depois de cada linha alterada. Sem autor na transação, recusa a gravação.
    await q.query(`
      CREATE FUNCTION auditar() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        v_autor text := nullif(current_setting('vermogen.autor', true), '');
        v_antes jsonb;
        v_depois jsonb;
      BEGIN
        IF v_autor IS NULL OR v_autor NOT IN ('matheus', 'claude', 'sistema') THEN
          RAISE EXCEPTION 'Alteração sem autor em %: toda gravação precisa informar quem a fez', TG_TABLE_NAME
            USING ERRCODE = 'insufficient_privilege';
        END IF;
        IF TG_OP <> 'INSERT' THEN v_antes := to_jsonb(OLD); END IF;
        IF TG_OP <> 'DELETE' THEN v_depois := to_jsonb(NEW); END IF;
        IF TG_OP = 'UPDATE' AND v_antes - 'atualizado_em' = v_depois - 'atualizado_em' THEN
          RETURN NULL; -- nada mudou de fato
        END IF;
        INSERT INTO auditoria (autor, tabela, registro_id, operacao, antes, depois)
        VALUES (v_autor, TG_TABLE_NAME, coalesce(v_depois, v_antes) ->> 'id', TG_OP, v_antes, v_depois);
        RETURN NULL;
      END
      $$
    `);

    // O log não se apaga e não se reescreve: só marcar como revisado ou revertido.
    await q.query(`
      CREATE FUNCTION proteger_auditoria() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'O registro de auditoria não pode ser apagado' USING ERRCODE = 'insufficient_privilege';
        END IF;
        IF (to_jsonb(OLD) - 'revisado' - 'revertido_por') <> (to_jsonb(NEW) - 'revisado' - 'revertido_por') THEN
          RAISE EXCEPTION 'O registro de auditoria não pode ser alterado' USING ERRCODE = 'insufficient_privilege';
        END IF;
        RETURN NEW;
      END
      $$
    `);
    await q.query(`
      CREATE TRIGGER auditoria_protegida BEFORE UPDATE OR DELETE ON auditoria
      FOR EACH ROW EXECUTE FUNCTION proteger_auditoria()
    `);

    // ----- Cadastros (HU-03 a HU-05) ---------------------------------------------------
    await q.query(`
      CREATE TABLE instituicao (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        nome          text NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 60),
        cor           text NOT NULL CHECK (cor ~ '^#[0-9A-F]{6}$'),
        ativa         boolean NOT NULL DEFAULT true,
        criado_em     timestamptz NOT NULL DEFAULT now(),
        atualizado_em timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE UNIQUE INDEX instituicao_nome_unico ON instituicao (lower(nome))`);

    await q.query(`
      CREATE TABLE conta (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        instituicao_id uuid NOT NULL REFERENCES instituicao (id),
        nome           text NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 60),
        tipo           text NOT NULL CHECK (tipo IN ('corrente', 'cartao', 'investimento', 'uso_restrito')),
        dia_fechamento smallint CHECK (dia_fechamento BETWEEN 1 AND 31),
        dia_vencimento smallint CHECK (dia_vencimento BETWEEN 1 AND 31),
        ativa          boolean NOT NULL DEFAULT true,
        criado_em      timestamptz NOT NULL DEFAULT now(),
        atualizado_em  timestamptz NOT NULL DEFAULT now(),
        -- Só cartão tem fechamento e vencimento, e cartão sempre tem os dois (RN-08).
        CONSTRAINT conta_dias_do_cartao CHECK (
          (tipo = 'cartao') = (dia_fechamento IS NOT NULL AND dia_vencimento IS NOT NULL)
          AND (tipo = 'cartao' OR (dia_fechamento IS NULL AND dia_vencimento IS NULL))
        )
      )
    `);
    await q.query(`CREATE UNIQUE INDEX conta_nome_unico ON conta (instituicao_id, lower(nome))`);

    await q.query(`
      CREATE TABLE conta_finalidade (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        conta_id    uuid NOT NULL REFERENCES conta (id),
        finalidade  text NOT NULL CHECK (finalidade IN ('gasto', 'recebimento', 'reserva', 'investimento')),
        vigente_de  date NOT NULL,
        vigente_ate date,
        CHECK (vigente_ate IS NULL OR vigente_ate >= vigente_de),
        -- RN-14: uma conta tem uma única finalidade em cada data.
        CONSTRAINT conta_finalidade_sem_sobreposicao
          EXCLUDE USING gist (conta_id WITH =, daterange(vigente_de, vigente_ate, '[]') WITH &&)
      )
    `);

    // ----- Datas reais do salário (RN-04) ----------------------------------------------
    // Só os ciclos com data informada pelo usuário têm linha; os demais são calculados (RN-01).
    await q.query(`
      CREATE TABLE ciclo (
        id                text PRIMARY KEY CHECK (id ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
        data_real_salario date NOT NULL,
        atualizado_em     timestamptz NOT NULL DEFAULT now()
      )
    `);

    for (const tabela of ['instituicao', 'conta', 'conta_finalidade', 'ciclo']) {
      await q.query(
        `CREATE TRIGGER ${tabela}_auditada AFTER INSERT OR UPDATE OR DELETE ON ${tabela}
         FOR EACH ROW EXECUTE FUNCTION auditar()`,
      );
    }

    // ----- Tokens do MCP (DT-11) -------------------------------------------------------
    await q.query(`
      CREATE TABLE token_mcp (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        nome          text NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 60),
        segredo_hash  text NOT NULL,
        criado_em     timestamptz NOT NULL DEFAULT now(),
        expira_em     timestamptz NOT NULL,
        revogado_em   timestamptz,
        ultimo_uso_em timestamptz
      )
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE token_mcp, ciclo, conta_finalidade, conta, instituicao`);
    await q.query(`DROP TABLE auditoria`);
    await q.query(`DROP FUNCTION proteger_auditoria(), auditar()`);
  }
}
