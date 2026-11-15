import { Module } from '@nestjs/common';
import { CadastrosModule } from '../cadastros/cadastros.module.js';
import { CalendarioModule } from '../calendario/calendario.module.js';
import { ClassificacaoController } from '../classificacao/classificacao.controller.js';
import { ClassificacaoService } from '../classificacao/classificacao.service.js';
import { PendenciasService } from '../classificacao/pendencias.service.js';
import { FaturasService } from '../faturas/faturas.service.js';
import { ImportacaoService } from '../importacao/importacao.service.js';
import { TransacoesController } from './transacoes.controller.js';
import { TransacoesService } from './transacoes.service.js';

/** Transações, lotes, classificação e pendências: um módulo, porque dependem uns dos outros. */
@Module({
  imports: [CalendarioModule, CadastrosModule],
  controllers: [TransacoesController, ClassificacaoController],
  providers: [TransacoesService, ImportacaoService, ClassificacaoService, PendenciasService, FaturasService],
  exports: [TransacoesService, ImportacaoService, ClassificacaoService, PendenciasService],
})
export class TransacoesModule {}
