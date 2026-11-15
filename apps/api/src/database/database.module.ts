import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CONFIG, type Config } from '../config/config.js';
import { conectarEMigrar } from './data-source.js';

@Global()
@Module({
  providers: [
    {
      provide: DataSource,
      inject: [CONFIG],
      useFactory: (config: Config) => {
        const logger = new Logger('Banco');
        return conectarEMigrar(config, (m) => logger.log(m));
      },
    },
  ],
  exports: [DataSource],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.dataSource.isInitialized) await this.dataSource.destroy();
  }
}
