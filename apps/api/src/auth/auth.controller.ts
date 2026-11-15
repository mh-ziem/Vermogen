import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CONFIG, type Config } from '../config/config.js';
import { AuthService } from './auth.service.js';
import { cookieDeSaida, cookieDeSessao } from './cookie.js';
import { Publica } from './publica.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  @Publica()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() corpo: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ usuario: string; expiraEm: string }> {
    const senha = (corpo as { senha?: unknown } | null)?.senha;
    if (typeof senha !== 'string' || senha.length === 0 || senha.length > 200) {
      throw new BadRequestException('Informe a senha');
    }
    const resultado = await this.auth.entrar(senha, req.headers['user-agent']);
    if (!resultado.ok) {
      if (resultado.motivo === 'bloqueado') {
        res.setHeader('Retry-After', String(resultado.esperaSegundos));
        throw new HttpException(
          'Muitas tentativas. Tente de novo mais tarde.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new UnauthorizedException('Senha incorreta');
    }
    res.setHeader('Set-Cookie', cookieDeSessao(resultado.token, this.config.cookieSeguro));
    return { usuario: 'matheus', expiraEm: resultado.expiraEm.toISOString() };
  }

  @Get('sessao')
  sessao(@Req() req: Request): { usuario: string; expiraEm: string } {
    const sessao = req.sessao!;
    return { usuario: sessao.usuario, expiraEm: sessao.expiraEm.toISOString() };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.sair(req.sessao!.id);
    res.setHeader('Set-Cookie', cookieDeSaida(this.config.cookieSeguro));
  }
}
