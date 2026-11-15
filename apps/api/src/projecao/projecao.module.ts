import { Module } from '@nestjs/common';
import { CadastrosModule } from '../cadastros/cadastros.module.js';
import { CalendarioModule } from '../calendario/calendario.module.js';
import { ProjecaoController } from './projecao.controller.js';
import { ProjecaoService } from './projecao.service.js';

@Module({
  imports: [CalendarioModule, CadastrosModule],
  controllers: [ProjecaoController],
  providers: [ProjecaoService],
  exports: [ProjecaoService],
})
export class ProjecaoModule {}
