import type { NextFunction, Request, Response } from 'express';
import type { TokenMcp, TokensService } from '../mcp/tokens.service.js';
import type { AuthService, Sessao } from './auth.service.js';
import { COOKIE_SESSAO, lerCookie } from './cookie.js';

declare module 'express-serve-static-core' {
  interface Request {
    sessao?: Sessao;
    tokenMcp?: TokenMcp;
  }
}

/** Rotas que respondem sem credencial (SAD DT-11). Qualquer outra em /api ou /mcp exige credencial. */
const ROTAS_PUBLICAS = new Set(['POST /api/auth/login', 'GET /api/health']);

function normalizar(caminho: string): string {
  return caminho.toLowerCase().replace(/\/+$/, '') || '/';
}

export function ehRotaDoMcp(caminho: string): boolean {
  const c = normalizar(caminho);
  return c === '/mcp' || c.startsWith('/mcp/');
}

export function ehRotaProtegida(caminho: string): boolean {
  const c = normalizar(caminho);
  return c === '/api' || c.startsWith('/api/') || ehRotaDoMcp(caminho);
}

function bearer(cabecalho: string | undefined): string | undefined {
  const m = cabecalho ? /^Bearer\s+(\S+)$/i.exec(cabecalho) : null;
  return m?.[1];
}

/**
 * Primeira barreira (HU-01 CA1): roda antes do roteador, então até uma rota que não existe
 * responde 401 sem credencial. Em /api vale só o cookie de sessão; em /mcp, só o token (DT-11).
 */
export function criarAuthMiddleware(auth: AuthService, tokens: TokensService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!ehRotaProtegida(req.path)) return next();

      if (ehRotaDoMcp(req.path)) {
        const token = await tokens.validar(bearer(req.headers.authorization));
        if (token) {
          req.tokenMcp = token;
          return next();
        }
        res.setHeader('WWW-Authenticate', 'Bearer realm="vermogen"');
        res.status(401).json({ statusCode: 401, message: 'Token do MCP ausente, inválido, expirado ou revogado' });
        return;
      }

      const sessao = await auth.validar(lerCookie(req.headers.cookie, COOKIE_SESSAO));
      if (sessao) {
        req.sessao = sessao;
        return next();
      }
      if (ROTAS_PUBLICAS.has(`${req.method} ${normalizar(req.path)}`)) return next();

      res.status(401).json({ statusCode: 401, message: 'Não autenticado' });
    } catch (erro) {
      next(erro);
    }
  };
}
