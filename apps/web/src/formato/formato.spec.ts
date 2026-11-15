import { describe, expect, it } from 'vitest'
import { ciclo, data, desde, reais, somarCiclos } from './index'

describe('formato', () => {
  it('datas no padrão brasileiro', () => {
    expect(data('2026-11-30')).toBe('30/11/2026')
    expect(data('2026-11-30', true)).toBe('30/11')
    expect(data(null)).toBe('—')
  })

  it('nome do ciclo', () => {
    expect(ciclo('2026-11')).toBe('Novembro/26')
    expect(ciclo('2027-01')).toBe('Janeiro/27')
  })

  it('vigência sem data aparece como "desde o início"', () => {
    expect(desde('2000-01-01')).toBe('desde o início')
    expect(desde('2027-03-16')).toBe('desde 16/03/2027')
  })

  it('dinheiro no padrão brasileiro, a partir do texto exato da API', () => {
    expect(reais('-1146.00')).toBe('-R$ 1.146,00')
    expect(reais('535.5')).toBe('R$ 535,50')
    expect(reais('1234567.89')).toBe('R$ 1.234.567,89')
    expect(reais(null)).toBe('—')
  })

  it('ciclo vizinho atravessa o ano', () => {
    expect(somarCiclos('2026-12', 1)).toBe('2027-01')
    expect(somarCiclos('2027-01', -1)).toBe('2026-12')
  })
})
