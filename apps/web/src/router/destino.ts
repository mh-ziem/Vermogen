/**
 * Para onde ir depois do login. Só aceita caminho interno do app:
 * um endereço externo no parâmetro `destino` é ignorado.
 */
export function destinoSeguro(destino: unknown): string {
  if (typeof destino !== 'string') return '/'
  if (!destino.startsWith('/') || destino.startsWith('//') || destino.includes('\\')) return '/'
  return destino
}
