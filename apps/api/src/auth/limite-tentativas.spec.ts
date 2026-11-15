import { LimiteDeTentativas } from './limite-tentativas.js';

describe('LimiteDeTentativas', () => {
  it('bloqueia na 5ª falha dentro de 15 minutos', () => {
    let agora = 0;
    const limite = new LimiteDeTentativas(5, 15 * 60_000, () => agora);
    for (let i = 0; i < 4; i++) limite.registrarFalha();
    expect(limite.bloqueado()).toBe(false);
    limite.registrarFalha();
    expect(limite.bloqueado()).toBe(true);
    expect(limite.segundosDeEspera()).toBe(900);

    agora = 15 * 60_000 + 1;
    expect(limite.bloqueado()).toBe(false);
  });

  it('um login certo zera a contagem', () => {
    const limite = new LimiteDeTentativas();
    for (let i = 0; i < 4; i++) limite.registrarFalha();
    limite.registrarSucesso();
    limite.registrarFalha();
    expect(limite.bloqueado()).toBe(false);
  });
});
