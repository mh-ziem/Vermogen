import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface TokenMcp {
  id: string;
  nome: string;
}

export interface TokenListado extends TokenMcp {
  criadoEm: string;
  expiraEm: string;
  revogadoEm: string | null;
  ultimoUsoEm: string | null;
}

/** Formato do token (DT-11): `vmg_<id sem hífens>_<segredo>`. */
const FORMATO = /^vmg_([0-9a-f]{32})_([A-Za-z0-9_-]{43})$/;
export const VALIDADE_DO_TOKEN = '6 months';

function idDoToken(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Tokens do Claude (DT-11). O banco guarda só o hash do segredo, com crypt() do pgcrypto.
 * O segredo tem 256 bits sorteados; o custo do hash fica baixo (8) para não pesar em cada chamada.
 */
@Injectable()
export class TokensService {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  async criar(nome: string): Promise<{ id: string; token: string; expiraEm: string }> {
    const id = randomUUID();
    const segredo = randomBytes(32).toString('base64url');
    const [linha] = await this.db.query(
      `INSERT INTO token_mcp (id, nome, segredo_hash, expira_em)
       VALUES ($1, $2, crypt($3, gen_salt('bf', 8)), now() + $4::interval)
       RETURNING expira_em`,
      [id, nome, segredo, VALIDADE_DO_TOKEN],
    );
    return { id, token: `vmg_${id.replace(/-/g, '')}_${segredo}`, expiraEm: new Date(linha.expira_em).toISOString() };
  }

  async validar(token: string | undefined): Promise<TokenMcp | null> {
    const partes = token ? FORMATO.exec(token) : null;
    if (!partes) return null;
    const id = idDoToken(partes[1]!);
    const [linha] = await this.db.query(
      `SELECT id, nome FROM token_mcp
        WHERE id = $1 AND revogado_em IS NULL AND expira_em > now() AND segredo_hash = crypt($2, segredo_hash)`,
      [id, partes[2]],
    );
    if (!linha) return null;
    await this.db.query(
      `UPDATE token_mcp SET ultimo_uso_em = now()
        WHERE id = $1 AND (ultimo_uso_em IS NULL OR ultimo_uso_em < now() - interval '1 hour')`,
      [id],
    );
    return { id: linha.id, nome: linha.nome };
  }

  async revogar(id: string): Promise<boolean> {
    const linhas = await this.db.query(
      `UPDATE token_mcp SET revogado_em = now() WHERE id = $1 AND revogado_em IS NULL RETURNING id`,
      [id],
    );
    return linhas.length > 0;
  }

  async listar(): Promise<TokenListado[]> {
    return this.db.query(
      `SELECT id, nome, criado_em AS "criadoEm", expira_em AS "expiraEm",
              revogado_em AS "revogadoEm", ultimo_uso_em AS "ultimoUsoEm"
         FROM token_mcp ORDER BY criado_em DESC`,
    );
  }
}
