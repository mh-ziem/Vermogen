import { DataSource } from 'typeorm';
import type { Config } from '../config/config.js';
import { migrations } from './migrations/index.js';

export function criarDataSource(config: Config): DataSource {
  return new DataSource({
    type: 'postgres',
    host: config.db.host,
    port: config.db.porta,
    database: config.db.nome,
    username: config.db.usuario,
    password: config.db.senha,
    // O esquema só muda por migração revisada (SAD DT-07).
    synchronize: false,
    migrationsRun: false,
    migrations,
    migrationsTableName: 'migracao',
    logging: config.logLevel === 'debug' ? ['error', 'warn', 'migration'] : ['error', 'warn'],
    extra: { max: 5, options: '-c timezone=America/Sao_Paulo' },
  });
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Conecta com novas tentativas (o app não depende da ordem de subida dos containers, SAD §6)
 * e aplica as migrações pendentes antes de o app abrir a porta (SAD DT-17).
 */
export async function conectarEMigrar(
  config: Config,
  avisar: (mensagem: string) => void = () => {},
  opcoes: { tentativas?: number; intervaloMs?: number } = {},
): Promise<DataSource> {
  const { tentativas = 60, intervaloMs = 2000 } = opcoes;
  const dataSource = criarDataSource(config);
  for (let i = 1; ; i++) {
    try {
      await dataSource.initialize();
      break;
    } catch (erro) {
      if (i >= tentativas) throw erro;
      avisar(`Banco indisponível (tentativa ${i}/${tentativas}): ${(erro as Error).message}`);
      await espera(intervaloMs);
    }
  }
  const aplicadas = await dataSource.runMigrations({ transaction: 'each' });
  avisar(aplicadas.length ? `Migrações aplicadas: ${aplicadas.map((m) => m.name).join(', ')}` : 'Banco já está atualizado');
  return dataSource;
}
