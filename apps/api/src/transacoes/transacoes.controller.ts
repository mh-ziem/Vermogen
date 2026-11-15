import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { autorDa } from '../auditoria/escrita.js';
import { idValido, validar } from '../comum/erros.js';
import { ImportacaoService } from '../importacao/importacao.service.js';
import { edicao, filtro, lancamento, lote } from './esquemas.js';
import { TransacoesService } from './transacoes.service.js';

@Controller()
export class TransacoesController {
  constructor(
    @Inject(TransacoesService) private readonly transacoes: TransacoesService,
    @Inject(ImportacaoService) private readonly importacao: ImportacaoService,
  ) {}

  @Get('transacoes')
  consultar(@Query() q: unknown) {
    return this.transacoes.consultar(validar(filtro, q));
  }

  @Get('transacoes/:id')
  obter(@Param('id') id: string) {
    return this.transacoes.obter(idValido(id));
  }

  /** HU-10: lançamento manual, no desktop e no celular. */
  @Post('transacoes')
  lancar(@Req() req: Request, @Body() corpo: unknown) {
    return this.transacoes.lancar(autorDa(req), validar(lancamento, corpo));
  }

  @Patch('transacoes/:id')
  editar(@Req() req: Request, @Param('id') id: string, @Body() corpo: unknown) {
    return this.transacoes.editar(autorDa(req), idValido(id), validar(edicao, corpo));
  }

  /** Exclusão sempre lógica: vai para a lixeira (HU-14 CA2). */
  @Delete('transacoes/:id')
  excluir(@Req() req: Request, @Param('id') id: string) {
    return this.transacoes.excluir(autorDa(req), idValido(id));
  }

  @Post('transacoes/:id/restaurar')
  @HttpCode(200)
  restaurar(@Req() req: Request, @Param('id') id: string) {
    return this.transacoes.restaurar(autorDa(req), idValido(id));
  }

  @Get('transacoes/:id/anotacao')
  lerAnotacao(@Param('id') id: string) {
    return this.transacoes.lerAnotacao(idValido(id));
  }

  @Put('transacoes/:id/anotacao')
  anotar(@Req() req: Request, @Param('id') id: string, @Body() corpo: unknown) {
    const { texto } = validar(z.object({ texto: z.string().max(2000) }).strict(), corpo);
    return this.transacoes.anotar(autorDa(req), idValido(id), texto);
  }

  // ----- Lotes ---------------------------------------------------------------------

  @Get('lotes')
  lotes(@Query() q: unknown) {
    const f = validar(
      z
        .object({
          contaId: z.uuid().optional(),
          ciclo: z.string().optional(),
          status: z.enum(['aceito', 'nao_conferido', 'desfeito']).optional(),
        })
        .strict(),
      q,
    );
    return this.importacao.listar(f);
  }

  /** Importação de lote pela tela (mesmo formato do MCP). */
  @Post('lotes')
  importar(@Req() req: Request, @Body() corpo: unknown) {
    return this.importacao.importar(autorDa(req), 'manual', validar(lote, corpo));
  }

  @Post('lotes/:id/desfazer')
  @HttpCode(200)
  desfazer(@Req() req: Request, @Param('id') id: string) {
    return this.importacao.desfazer(autorDa(req), idValido(id));
  }
}
