import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';

export const SENHA = 'senha-de-teste-123';

export interface Contexto {
  app: NestExpressApplication;
  db: DataSource;
}

/** Sobe o app inteiro (com migrações) contra o banco de teste, como em produção. */
export async function subirApp(): Promise<Contexto> {
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = modulo.createNestApplication<NestExpressApplication>({ logger: false });
  configurarApp(app);
  await app.init();
  return { app, db: app.get(DataSource) };
}

/** Deixa o banco com um único usuário e nenhuma sessão. */
export async function reiniciarDados(db: DataSource): Promise<void> {
  // TRUNCATE não dispara os gatilhos por linha, então limpa também a auditoria.
  await db.query(
    `TRUNCATE sessao, usuario, token_mcp, ciclo, conta_finalidade, conta, instituicao, auditoria RESTART IDENTITY CASCADE`,
  );
  // Custo 4 só nos testes, para não gastar tempo no hash.
  await db.query(`INSERT INTO usuario (nome, senha_hash) VALUES ('matheus', crypt($1, gen_salt('bf', 4)))`, [
    SENHA,
  ]);
}

export function cookieDe(resposta: { headers: Record<string, unknown> }): string {
  const cabecalho = resposta.headers['set-cookie'] as string[] | undefined;
  const cookie = cabecalho?.[0]?.split(';')[0];
  if (!cookie) throw new Error('A resposta não trouxe cookie de sessão');
  return cookie;
}

/** Faz login e devolve o cookie da sessão. */
export async function entrar(ctx: Contexto): Promise<string> {
  const { default: request } = await import('supertest');
  return cookieDe(await request(ctx.app.getHttpServer()).post('/api/auth/login').send({ senha: SENHA }).expect(200));
}
