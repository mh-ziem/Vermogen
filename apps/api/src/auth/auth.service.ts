import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DIAS_DE_SESSAO } from './cookie.js';
import { LimiteDeTentativas } from './limite-tentativas.js';

export const USUARIO_UNICO = 'matheus';

export interface Sessao {
  id: string;
  usuario: string;
  expiraEm: Date;
}

export type ResultadoLogin =
  | { ok: true; token: string; expiraEm: Date }
  | { ok: false; motivo: 'credencial_invalida' }
  | { ok: false; motivo: 'bloqueado'; esperaSegundos: number };

@Injectable()
export class AuthService {
  private readonly limite = new LimiteDeTentativas();

  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  /**
   * Confere a senha no próprio banco, com crypt() do pgcrypto (HU-01 CA3).
   * O navegador recebe um identificador aleatório; o banco guarda só o hash dele.
   */
  async entrar(senha: string, dispositivo: string | undefined): Promise<ResultadoLogin> {
    if (this.limite.bloqueado()) {
      return { ok: false, motivo: 'bloqueado', esperaSegundos: this.limite.segundosDeEspera() };
    }
    const usuarios: { id: string }[] = await this.dataSource.query(
      `SELECT id FROM usuario WHERE nome = $1 AND senha_hash = crypt($2, senha_hash)`,
      [USUARIO_UNICO, senha],
    );
    const usuario = usuarios[0];
    if (!usuario) {
      this.limite.registrarFalha();
      return { ok: false, motivo: 'credencial_invalida' };
    }
    this.limite.registrarSucesso();

    const token = randomBytes(32).toString('base64url');
    const sessoes: { expira_em: Date }[] = await this.dataSource.query(
      `INSERT INTO sessao (usuario_id, token_hash, dispositivo, expira_em)
       VALUES ($1, digest($2, 'sha256'), $3, now() + make_interval(days => $4))
       RETURNING expira_em`,
      [usuario.id, token, dispositivo?.slice(0, 300) ?? null, DIAS_DE_SESSAO],
    );
    await this.dataSource.query(`DELETE FROM sessao WHERE expira_em < now()`);
    return { ok: true, token, expiraEm: sessoes[0]!.expira_em };
  }

  /** Devolve a sessão se o identificador existir e não tiver expirado (HU-01 CA2). */
  async validar(token: string | undefined): Promise<Sessao | null> {
    if (!token || token.length > 200) return null;
    const linhas: { id: string; nome: string; expira_em: Date }[] = await this.dataSource.query(
      `SELECT s.id, u.nome, s.expira_em
         FROM sessao s JOIN usuario u ON u.id = s.usuario_id
        WHERE s.token_hash = digest($1, 'sha256') AND s.expira_em > now()`,
      [token],
    );
    const linha = linhas[0];
    if (!linha) return null;
    // Atualiza o último uso no máximo uma vez por hora, para não gravar a cada requisição.
    await this.dataSource.query(
      `UPDATE sessao SET ultimo_uso_em = now() WHERE id = $1 AND ultimo_uso_em < now() - interval '1 hour'`,
      [linha.id],
    );
    return { id: linha.id, usuario: linha.nome, expiraEm: linha.expira_em };
  }

  async sair(sessaoId: string): Promise<void> {
    await this.dataSource.query(`DELETE FROM sessao WHERE id = $1`, [sessaoId]);
  }
}
