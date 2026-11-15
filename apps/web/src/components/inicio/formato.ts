/** Formatação própria da tela inicial (valores arredondados dos indicadores e do gráfico). */

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

/** Valor da API em centavos inteiros (evita somar texto decimal em ponto flutuante). */
export function centavos(valor: string | null | undefined): number {
  if (!valor) return 0
  return Math.round(Number(valor) * 100)
}

/** Número inteiro com separador de milhar: 1146 → "1.146"; -120 → "-120". */
export function inteiro(n: number): string {
  const arred = Math.round(n)
  const milhar = String(Math.abs(arred)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${arred < 0 ? '-' : ''}${milhar}`
}

/** Centavos → reais arredondados, sem sinal: 104049 → "1.040". */
export function semCentavos(c: number): string {
  return inteiro(Math.abs(c) / 100)
}

/** Centavos → "R$ 1.040" (arredondado, sem sinal). */
export function reaisCurto(c: number): string {
  return `R$ ${semCentavos(c)}`
}

/** Centavos → texto decimal da API, sem sinal: -114600 → "1146.00". */
export function textoAbsoluto(c: number): string {
  const a = Math.abs(c)
  return `${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`
}

/** `2026-11` → `Nov`. */
export function mesCurto(id: string): string {
  return MESES_CURTOS[Number(id.split('-')[1]) - 1] ?? id
}

/** Percentual com uma casa e vírgula: 19.804 → "19,8%". */
export function percentual(p: number, casas = 1): string {
  return `${p.toFixed(casas).replace('.', ',')}%`
}

/** Rótulo do eixo: 0 → "0"; 2000 → "2 mil"; 1500 → "1,5 mil"; -500 → "-500". */
export function rotuloDoEixo(reais: number): string {
  if (reais === 0) return '0'
  if (Math.abs(reais) < 1000) return inteiro(reais)
  const mil = reais / 1000
  return `${Number.isInteger(mil) ? mil : mil.toFixed(1).replace('.', ',')} mil`
}

/** Dias entre duas datas `AAAA-MM-DD` (b − a). */
export function diasEntre(a: string, b: string): number {
  const utc = (iso: string) => {
    const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number) as [number, number, number]
    return Date.UTC(ano, mes - 1, dia)
  }
  return Math.round((utc(b) - utc(a)) / 86_400_000)
}

/** Passo "redondo" para as linhas de grade: 1, 2, 2,5 ou 5 × 10^n. */
export function passoRedondo(bruto: number): number {
  if (bruto <= 0) return 1
  const ordem = 10 ** Math.floor(Math.log10(bruto))
  const f = bruto / ordem
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * ordem
}
