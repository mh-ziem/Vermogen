import { ehRotaProtegida } from './auth.middleware.js';

describe('ehRotaProtegida', () => {
  it('protege /api e /mcp, em qualquer caixa', () => {
    for (const caminho of ['/api', '/api/', '/api/qualquer', '/API/auth/sessao', '/mcp', '/Mcp/x']) {
      expect(ehRotaProtegida(caminho)).toBe(true);
    }
  });

  it('deixa passar os arquivos da tela', () => {
    for (const caminho of ['/', '/index.html', '/assets/app.js', '/apix', '/login']) {
      expect(ehRotaProtegida(caminho)).toBe(false);
    }
  });
});
