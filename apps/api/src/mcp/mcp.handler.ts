import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { NextFunction, Request, Response } from 'express';
import type { ServidorMcp } from './servidor.js';

/**
 * Atende `POST /mcp` pelo transporte Streamable HTTP, sem sessão (DT-12).
 * A autenticação por token já aconteceu no middleware de autenticação.
 */
export function criarHandlerMcp(servidorMcp: ServidorMcp) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Use POST' }, id: null });
      return;
    }
    try {
      const servidor = servidorMcp.criar();
      const transporte = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on('close', () => {
        void transporte.close();
        void servidor.close();
      });
      await servidor.connect(transporte);
      await transporte.handleRequest(req, res, req.body);
    } catch (erro) {
      next(erro);
    }
  };
}
