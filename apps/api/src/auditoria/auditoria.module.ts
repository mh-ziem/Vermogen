import { Global, Module } from '@nestjs/common';
import { Escrita } from './escrita.js';

@Global()
@Module({ providers: [Escrita], exports: [Escrita] })
export class AuditoriaModule {}
