import { Module } from '@nestjs/common';
import { AuditoriaModule } from './auditoria/auditoria.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CadastrosModule } from './cadastros/cadastros.module.js';
import { CalendarioModule } from './calendario/calendario.module.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { McpModule } from './mcp/mcp.module.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuditoriaModule,
    AuthModule,
    HealthModule,
    CalendarioModule,
    CadastrosModule,
    McpModule,
  ],
})
export class AppModule {}
