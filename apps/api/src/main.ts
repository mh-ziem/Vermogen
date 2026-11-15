import 'reflect-metadata';
import { Logger, type LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configurarApp } from './app.setup.js';
import { CONFIG, type Config } from './config/config.js';

const NIVEIS: Record<Config['logLevel'], LogLevel[]> = {
  error: ['fatal', 'error'],
  warn: ['fatal', 'error', 'warn'],
  info: ['fatal', 'error', 'warn', 'log'],
  debug: ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'],
};

async function iniciar(): Promise<void> {
  const nivel = (process.env.LOG_LEVEL ?? 'info') as Config['logLevel'];
  // A criação do app conecta ao banco e aplica as migrações; só depois a porta abre (SAD DT-17).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: NIVEIS[nivel] ?? NIVEIS.info,
  });
  configurarApp(app);
  const config = app.get<Config>(CONFIG);
  await app.listen(config.porta, '0.0.0.0');
  new Logger('Vermogen').log(`Versão ${config.versao} ouvindo na porta ${config.porta}`);
}

try {
  await iniciar();
} catch (erro) {
  // Falha de configuração, de banco ou de migração: encerra com erro no log (SAD §6).
  new Logger('Vermogen').error(`Falha ao iniciar: ${(erro as Error).stack ?? erro}`);
  process.exit(1);
}
