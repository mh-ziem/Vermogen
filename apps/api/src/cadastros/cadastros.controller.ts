import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { autorDa } from '../auditoria/escrita.js';
import { idValido, validar } from '../comum/erros.js';
import { CadastrosService } from './cadastros.service.js';
import {
  data,
  edicaoDeConta,
  edicaoDeInstituicao,
  mudancaDeFinalidade,
  novaConta,
  novaInstituicao,
} from './esquemas.js';

const comInativas = z.object({ incluirInativas: z.enum(['true', 'false']).optional() }).strict();

@Controller()
export class CadastrosController {
  constructor(@Inject(CadastrosService) private readonly cadastros: CadastrosService) {}

  @Get('instituicoes')
  listarInstituicoes(@Query() q: unknown) {
    return this.cadastros.listarInstituicoes(validar(comInativas, q).incluirInativas === 'true');
  }

  @Post('instituicoes')
  criarInstituicao(@Req() req: Request, @Body() corpo: unknown) {
    return this.cadastros.criarInstituicao(autorDa(req), validar(novaInstituicao, corpo));
  }

  @Patch('instituicoes/:id')
  atualizarInstituicao(@Req() req: Request, @Param('id') id: string, @Body() corpo: unknown) {
    return this.cadastros.atualizarInstituicao(autorDa(req), idValido(id), validar(edicaoDeInstituicao, corpo));
  }

  @Get('contas')
  listarContas(@Query() q: unknown) {
    return this.cadastros.listarContas(validar(comInativas, q).incluirInativas === 'true');
  }

  @Get('contas/:id')
  obterConta(@Param('id') id: string) {
    return this.cadastros.obterConta(idValido(id));
  }

  @Post('contas')
  criarConta(@Req() req: Request, @Body() corpo: unknown) {
    return this.cadastros.criarConta(autorDa(req), validar(novaConta, corpo));
  }

  @Patch('contas/:id')
  atualizarConta(@Req() req: Request, @Param('id') id: string, @Body() corpo: unknown) {
    return this.cadastros.atualizarConta(autorDa(req), idValido(id), validar(edicaoDeConta, corpo));
  }

  @Get('contas/:id/finalidades')
  historico(@Param('id') id: string) {
    return this.cadastros.historicoDeFinalidade(idValido(id));
  }

  @Post('contas/:id/finalidades')
  mudarFinalidade(@Req() req: Request, @Param('id') id: string, @Body() corpo: unknown) {
    return this.cadastros.mudarFinalidade(autorDa(req), idValido(id), validar(mudancaDeFinalidade, corpo));
  }

  /** Em que fatura e em que ciclo uma compra nessa data é paga (HU-07). */
  @Get('contas/:id/fatura')
  fatura(@Param('id') id: string, @Query() q: unknown) {
    const { compra } = validar(z.object({ compra: data }).strict(), q);
    return this.cadastros.faturaDaCompra(idValido(id), compra);
  }
}
