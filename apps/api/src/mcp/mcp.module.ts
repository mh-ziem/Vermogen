import { Global, Module } from '@nestjs/common';
import { CadastrosModule } from '../cadastros/cadastros.module.js';
import { ServidorMcp } from './servidor.js';
import { TokensService } from './tokens.service.js';

@Global()
@Module({ imports: [CadastrosModule], providers: [TokensService, ServidorMcp], exports: [TokensService, ServidorMcp] })
export class McpModule {}
