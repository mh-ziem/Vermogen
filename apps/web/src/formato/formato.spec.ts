import { describe, expect, it } from 'vitest'
import { ciclo, data, desde } from './index'

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
})
