import { Module } from '@nestjs/common';
import { CadastrosModule } from '../cadastros/cadastros.module.js';
import { CalendarioModule } from '../calendario/calendario.module.js';
import { ProjecaoModule } from '../projecao/projecao.module.js';
import { TransacoesModule } from '../transacoes/transacoes.module.js';
import { AberturaController } from './abertura.controller.js';
import { AberturaService } from './abertura.service.js';

@Module({
  imports: [CalendarioModule, CadastrosModule, TransacoesModule, ProjecaoModule],
  controllers: [AberturaController],
  providers: [AberturaService],
})
export class AberturaModule {}
