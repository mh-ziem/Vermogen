import { Module } from '@nestjs/common';
import { CiclosController } from './ciclos.controller.js';
import { CiclosService } from './ciclos.service.js';

@Module({ controllers: [CiclosController], providers: [CiclosService], exports: [CiclosService] })
export class CalendarioModule {}
