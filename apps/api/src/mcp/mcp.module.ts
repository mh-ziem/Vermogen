import { Global, Module } from '@nestjs/common';
import { CadastrosModule } from '../cadastros/cadastros.module.js';
import { ProjecaoModule } from '../projecao/projecao.module.js';
import { TransacoesModule } from '../transacoes/transacoes.module.js';
import { ServidorMcp } from './servidor.js';
import { TokensService } from './tokens.service.js';

@Global()
@Module({ imports: [CadastrosModule, TransacoesModule, ProjecaoModule], providers: [TokensService, ServidorMcp], exports: [TokensService, ServidorMcp] })
export class McpModule {}
