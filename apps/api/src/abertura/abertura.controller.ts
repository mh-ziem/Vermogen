import { Body, Controller, Get, Inject, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { autorDa } from '../auditoria/escrita.js';
import { validar } from '../comum/erros.js';
import { plano } from '../projecao/esquemas.js';
import { AberturaService } from './abertura.service.js';

/** HU-17: abertura do ciclo atual. */
@Controller('abertura')
export class AberturaController {
  constructor(@Inject(AberturaService) private readonly abertura: AberturaService) {}

  @Get()
  obter() {
    return this.abertura.obter();
  }

  @Put('plano')
  definirPlano(@Req() req: Request, @Body() corpo: unknown) {
    return this.abertura.definirPlano(autorDa(req), validar(plano, corpo));
  }

  @Post('congelar')
  congelar(@Req() req: Request) {
    return this.abertura.congelar(autorDa(req));
  }
}
