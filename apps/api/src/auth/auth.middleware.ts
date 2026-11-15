import type { NextFunction, Request, Response } from 'express';
import type { AuthService, Sessao } from './auth.service.js';
import { COOKIE_SESSAO, lerCookie } from './cookie.js';

declare module 'express-serve-static-core' {
  interface Request {
    sessao?: Sessao;
  }
}

/** Rotas que respondem sem credencial (SAD DT-11). Qualquer outra em /api ou /mcp exige sessão. */
const ROTAS_PUBLICAS = new Set(['POST /api/auth/login', 'GET /api/health']);

export function ehRotaProtegida(caminho: string): boolean {
  const c = caminho.toLowerCase();
  return c === '/api' || c.startsWith('/api/') || c === '/mcp' || c.startsWith('/mcp/');
}

/**
 * Primeira barreira (HU-01 CA1): roda antes do roteador, então até uma rota que não existe
 * responde 401 sem credencial. A segunda barreira é o AuthGuard, que protege cada handler.
 */
export function criarAuthMiddleware(auth: AuthService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!ehRotaProtegida(req.path)) return next();

      const sessao = await auth.validar(lerCookie(req.headers.cookie, COOKIE_SESSAO));
      if (sessao) {
        req.sessao = sessao;
        return next();
      }
      const chave = `${req.method} ${req.path.toLowerCase().replace(/\/+$/, '')}`;
      if (ROTAS_PUBLICAS.has(chave)) return next();

      res.status(401).json({ statusCode: 401, message: 'Não autenticado' });
    } catch (erro) {
      next(erro);
    }
  };
}
