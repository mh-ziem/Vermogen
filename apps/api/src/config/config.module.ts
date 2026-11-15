import { Global, Module } from '@nestjs/common';
import { CONFIG, carregarConfig } from './config.js';

@Global()
@Module({
  providers: [{ provide: CONFIG, useFactory: () => carregarConfig() }],
  exports: [CONFIG],
})
export class ConfigModule {}
