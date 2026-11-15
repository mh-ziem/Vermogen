import { defineConfig } from 'vitest/config';

// Testes de integração: usam um PostgreSQL real (local: `npm run dev:db` na raiz).
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['./test/ambiente.ts'],
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
