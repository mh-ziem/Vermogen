/**
 * Dinheiro em centavos inteiros no código (SAD DT-08): nunca ponto flutuante.
 * Aceita número com até 2 casas (ex.: -47.9) ou texto (ex.: "-47.90").
 */
export function paraCentavos(valor: number | string): number {
  const texto = typeof valor === 'number' ? valor.toFixed(6) : valor.trim();
  const m = /^(-)?(\d{1,10})(?:\.(\d{1,6}))?$/.exec(texto);
  if (!m) throw new Error(`Valor inválido: ${valor}`);
  const casas = (m[3] ?? '').padEnd(6, '0');
  if (Number(casas.slice(2)) !== 0) throw new Error(`Valor com mais de 2 casas decimais: ${valor}`);
  const centavos = Number(m[2]) * 100 + Number(casas.slice(0, 2));
  return m[1] && centavos !== 0 ? -centavos : centavos;
}

/** Centavos → texto decimal para o PostgreSQL (`numeric`) e para respostas: 4790 → "47.90". */
export function deCentavos(centavos: number): string {
  const sinal = centavos < 0 ? '-' : '';
  const abs = Math.abs(centavos);
  return `${sinal}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Valor do banco (`numeric` chega como texto) → centavos. */
export function centavosDoBanco(valor: string | null): number | null {
  return valor === null ? null : paraCentavos(valor);
}

/** Formato brasileiro para mensagens: -4790 → "-R$ 47,90". */
export function emReais(centavos: number): string {
  const [inteiro, dec] = deCentavos(Math.abs(centavos)).split('.');
  const milhar = inteiro!.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${centavos < 0 ? '-' : ''}R$ ${milhar},${dec}`;
}
