import { Body, Controller, Delete, Get, Inject, Param, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { autorDa } from '../auditoria/escrita.js';
import { data } from '../cadastros/esquemas.js';
import { validar } from '../comum/erros.js';
import { CiclosService } from './ciclos.service.js';
import { feriadosBancarios } from './feriados.js';

@Controller()
export class CiclosController {
  constructor(@Inject(CiclosService) private readonly ciclos: CiclosService) {}

  @Get('ciclos/atual')
  atual() {
    return this.ciclos.atual();
  }

  @Get('ciclos')
  listar(@Query() q: unknown) {
    const { de, ate } = validar(z.object({ de: z.string(), ate: z.string() }).strict(), q);
    return this.ciclos.listar(de, ate);
  }

  @Put('ciclos/:id/salario')
  definir(@Req() req: Request, @Param('id') id: string, @Body() corpo: unknown) {
    return this.ciclos.definirDataReal(autorDa(req), id, validar(z.object({ data }).strict(), corpo).data);
  }

  @Delete('ciclos/:id/salario')
  remover(@Req() req: Request, @Param('id') id: string) {
    return this.ciclos.removerDataReal(autorDa(req), id);
  }

  @Get('feriados')
  feriados(@Query() q: unknown) {
    const { ano } = validar(z.object({ ano: z.coerce.number().int().min(2000).max(2100) }).strict(), q);
    return feriadosBancarios(ano);
  }
}
