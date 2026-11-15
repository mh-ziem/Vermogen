import { cookieDeSessao, lerCookie } from './cookie.js';

describe('lerCookie', () => {
  it('encontra o cookie entre outros', () => {
    expect(lerCookie('a=1; vermogen_sessao=abc-_123; b=2', 'vermogen_sessao')).toBe('abc-_123');
  });

  it('devolve undefined quando não há cabeçalho, cookie ou valor', () => {
    expect(lerCookie(undefined, 'vermogen_sessao')).toBeUndefined();
    expect(lerCookie('a=1', 'vermogen_sessao')).toBeUndefined();
    expect(lerCookie('vermogen_sessao=', 'vermogen_sessao')).toBeUndefined();
  });

  it('não confunde nomes parecidos', () => {
    expect(lerCookie('xvermogen_sessao=1', 'vermogen_sessao')).toBeUndefined();
  });
});

describe('cookieDeSessao', () => {
  it('dura 30 dias e não fica acessível a scripts (QA-02)', () => {
    const cookie = cookieDeSessao('t', true);
    expect(cookie).toContain('Max-Age=2592000');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Secure');
  });

  it('sem https, sai sem Secure (desenvolvimento local)', () => {
    expect(cookieDeSessao('t', false)).not.toContain('Secure');
  });
});
