/** Texto para comparação: sem acento, minúsculo, espaços simples. "Pão  de AÇÚCAR" → "pao de acucar". */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
