import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { autorDa } from '../auditoria/escrita.js';
import { idValido, validar } from '../comum/erros.js';
import { edicaoDeCategoria, edicaoDeRegra, novaCategoria, novaRegra, resolucao } from '../transacoes/esquemas.js';
import { ClassificacaoService } from './classificacao.service.js';
import { PendenciasService } from './pendencias.service.js';

@Controller()
export class ClassificacaoController {
  constructor(
    @Inject(ClassificacaoService) private readonly classificacao: ClassificacaoService,
    @Inject(PendenciasService) private readonly pendencias: PendenciasService,
  ) {}

  @Get('categorias')
  categorias(@Query() q: unknown) {
    const { incluirInativas } = validar(z.object({ incluirInativas: z.enum(['true', 'false']).optional() }).strict(), q);
    return this.classificacao.listarCategorias(incluirInativas === 'true');
  }

  @Post('categorias')
  criarCategoria(@Req() req: Request, @Body() corpo: unknown) {
    return this.classificacao.criarCategoria(autorDa(req), validar(novaCategoria, corpo));
  }

  @Patch('categorias/:id')
  atualizarCategoria(@Req() req: Request, @Param('id') id: string, @Body() corpo: unknown) {
    return this.classificacao.atualizarCategoria(autorDa(req), idValido(id), validar(edicaoDeCategoria, corpo));
  }

  @Get('regras')
  regras() {
    return this.classificacao.listarRegras();
  }

  @Post('regras')
  criarRegra(@Req() req: Request, @Body() corpo: unknown) {
    return this.classificacao.criarRegra(autorDa(req), validar(novaRegra, corpo));
  }

  @Patch('regras/:id')
  atualizarRegra(@Req() req: Request, @Param('id') id: string, @Body() corpo: unknown) {
    return this.classificacao.atualizarRegra(autorDa(req), idValido(id), validar(edicaoDeRegra, corpo));
  }

  @Get('pendencias')
  listarPendencias() {
    return this.pendencias.listar();
  }

  @Post('pendencias/resolver')
  @HttpCode(200)
  resolver(@Req() req: Request, @Body() corpo: unknown) {
    return this.pendencias.resolver(autorDa(req), validar(resolucao, corpo));
  }
}
