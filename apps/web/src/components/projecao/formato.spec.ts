import { describe, expect, it } from 'vitest'
import { cicloCurto, dataHora, dinheiroDigitado, percentual, percentualDigitado } from './formato'

describe('formato da projeção', () => {
  it('valor positivo digitado vira o texto da API com 2 casas', () => {
    expect(dinheiroDigitado('460,00')).toBe('460.00')
    expect(dinheiroDigitado('460')).toBe('460.00')
    expect(dinheiroDigitado('1.146,5')).toBe('1146.50')
    expect(dinheiroDigitado('R$ 4600.00')).toBe('4600.00')
    expect(dinheiroDigitado('1.500')).toBe('1500.00')
    expect(dinheiroDigitado('1.50')).toBe('1.50')
    expect(dinheiroDigitado('0')).toBe('0.00')
    expect(dinheiroDigitado('-10')).toBeNull()
    expect(dinheiroDigitado('abc')).toBeNull()
    expect(dinheiroDigitado('')).toBeNull()
  })

  it('percentual digitado', () => {
    expect(percentualDigitado('10')).toBe(10)
    expect(percentualDigitado('12,5')).toBe(12.5)
    expect(percentualDigitado('101')).toBeNull()
    expect(percentualDigitado('x')).toBeNull()
  })

  it('percentual do salário e datas', () => {
    expect(percentual('-460.00', '4600.00')).toBe('10%')
    expect(percentual('575.00', '4600.00')).toBe('12,5%')
    expect(percentual('1', '0')).toBe('—')
    expect(cicloCurto('2026-08')).toBe('Ago/26')
    expect(dataHora('2026-11-15T13:42:00Z')).toBe('15/11 às 10:42')
  })
})
