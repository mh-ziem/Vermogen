import { Body, Controller, Get, Inject, Param, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { autorDa } from '../auditoria/escrita.js';
import { idValido, validar } from '../comum/erros.js';
import { parametros, valorFixo } from './esquemas.js';
import { ProjecaoService } from './projecao.service.js';

@Controller()
export class ProjecaoController {
  constructor(@Inject(ProjecaoService) private readonly projecao: ProjecaoService) {}

  /** HU-15 e HU-16: os 12 ciclos, o livre para gastar e o congelamento do ciclo atual. */
  @Get('projecao')
  consultar() {
    return this.projecao.projecao();
  }

  @Get('parametros')
  lerParametros() {
    return this.projecao.parametros();
  }

  /** Vale a partir do ciclo atual (DM-26). */
  @Put('parametros')
  definirParametros(@Req() req: Request, @Body() corpo: unknown) {
    return this.projecao.definirParametros(autorDa(req), validar(parametros, corpo));
  }

  /** RN-10: categorias intermitentes, o maior dos 3 ciclos e o valor fixado. */
  @Get('fixas')
  fixas() {
    return this.projecao.fixas();
  }

  @Put('fixas/:categoriaId')
  definirFixa(@Req() req: Request, @Param('categoriaId') id: string, @Body() corpo: unknown) {
    return this.projecao.definirFixa(autorDa(req), idValido(id), validar(valorFixo, corpo).valor);
  }
}
