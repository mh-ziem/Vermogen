export const COOKIE_SESSAO = 'vermogen_sessao';
export const DIAS_DE_SESSAO = 30;

/** Extrai um cookie do cabeçalho `Cookie`. */
export function lerCookie(cabecalho: string | undefined, nome: string): string | undefined {
  if (!cabecalho) return undefined;
  for (const parte of cabecalho.split(';')) {
    const igual = parte.indexOf('=');
    if (igual < 0) continue;
    if (parte.slice(0, igual).trim() === nome) {
      const valor = parte.slice(igual + 1).trim();
      return valor || undefined;
    }
  }
  return undefined;
}

export function cookieDeSessao(token: string, seguro: boolean): string {
  const maxAge = DIAS_DE_SESSAO * 24 * 60 * 60;
  return `${COOKIE_SESSAO}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${seguro ? '; Secure' : ''}`;
}

export function cookieDeSaida(seguro: boolean): string {
  return `${COOKIE_SESSAO}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${seguro ? '; Secure' : ''}`;
}
