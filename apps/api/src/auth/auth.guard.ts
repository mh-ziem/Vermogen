import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROTA_PUBLICA } from './publica.decorator.js';

/**
 * Segunda barreira: nenhum handler roda sem sessão, a menos que esteja marcado com @Publica().
 * Vale para todo controller, inclusive os que forem criados depois.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const publica = this.reflector.getAllAndOverride<boolean>(ROTA_PUBLICA, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (publica) return true;
    // Os handlers do Nest atendem só /api, onde a credencial é o cookie de sessão.
    if (contexto.switchToHttp().getRequest<Request>().sessao) return true;
    throw new UnauthorizedException('Não autenticado');
  }
}
