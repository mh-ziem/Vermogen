import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express, { type NextFunction, type Request, type Response } from 'express';
import { criarAuthMiddleware, ehRotaProtegida } from './auth/auth.middleware.js';
import { AuthService } from './auth/auth.service.js';
import { CONFIG, type Config } from './config/config.js';

/**
 * Configuração comum ao app real (main.ts) e aos testes de integração:
 * cabeçalhos de segurança, barreira de autenticação e arquivos da tela (SAD DT-05, DT-11).
 */
export function configurarApp(app: NestExpressApplication): void {
  const config = app.get<Config>(CONFIG);

  app.setGlobalPrefix('api');
  app.disable('x-powered-by');
  app.enableShutdownHooks();

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'",
    );
    next();
  });

  app.use(criarAuthMiddleware(app.get(AuthService)));

  // Arquivos estáticos do Vue (DT-01). Em desenvolvimento e nos testes a pasta pode não existir.
  const indice = join(config.webDist, 'index.html');
  if (existsSync(indice)) {
    app.use(
      express.static(config.webDist, {
        index: false,
        setHeaders: (res, caminho) => {
          // Os arquivos em /assets têm hash no nome; o index.html nunca fica em cache.
          res.setHeader(
            'Cache-Control',
            caminho.includes(`${join('/', 'assets', '/')}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
          );
        },
      }),
    );
    // Qualquer endereço de tela devolve o index.html; o Vue Router resolve a rota no navegador.
    app.use((req: Request, res: Response, next: NextFunction) => {
      const ehTela =
        (req.method === 'GET' || req.method === 'HEAD') && !ehRotaProtegida(req.path) && !extname(req.path);
      if (!ehTela) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indice);
    });
  }
}
