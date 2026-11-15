// Padrões para rodar os testes de integração no banco local (`npm run dev:db` na raiz).
// No pipeline, as mesmas variáveis chegam do ambiente e prevalecem.
process.env.NODE_ENV ??= 'test';
process.env.LOG_LEVEL ??= 'error';
process.env.DB_HOST ??= '127.0.0.1';
process.env.DB_PORT ??= '54329';
process.env.DB_NAME ??= 'vermogen';
process.env.DB_USER ??= 'vermogen';
if (!process.env.DB_PASSWORD_FILE) process.env.DB_PASSWORD ??= 'vermogen_dev';
if (!process.env.PGCRYPTO_KEY_FILE) process.env.PGCRYPTO_KEY ??= 'chave_de_teste';
