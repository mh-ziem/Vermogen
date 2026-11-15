import { Module } from '@nestjs/common';
import { CalendarioModule } from '../calendario/calendario.module.js';
import { CadastrosController } from './cadastros.controller.js';
import { CadastrosService } from './cadastros.service.js';

@Module({
  imports: [CalendarioModule],
  controllers: [CadastrosController],
  providers: [CadastrosService],
  exports: [CadastrosService],
})
export class CadastrosModule {}
