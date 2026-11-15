import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Publica } from '../auth/publica.decorator.js';
import { CONFIG, type Config } from '../config/config.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /**
   * Rota pública (SAD DT-11): responde só "ok" e a versão.
   * O app só abre a porta depois das migrações; aqui basta confirmar que o banco responde.
   */
  @Publica()
  @Get()
  async verificar(): Promise<{ status: 'ok'; versao: string }> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({ status: 'erro', versao: this.config.versao });
    }
    return { status: 'ok', versao: this.config.versao };
  }
}
