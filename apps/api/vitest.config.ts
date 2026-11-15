import { defineConfig } from 'vitest/config';

// Testes de unidade: não usam banco.
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
  },
});
