import { describe, expect, it } from 'vitest'
import { destinoSeguro } from './destino'

describe('destinoSeguro', () => {
  it('aceita caminho interno', () => {
    expect(destinoSeguro('/transacoes?ciclo=2026-11')).toBe('/transacoes?ciclo=2026-11')
  })

  it('ignora endereço externo e valores estranhos', () => {
    for (const valor of ['https://exemplo.com', '//exemplo.com', '/\\exemplo.com', 'javascript:alert(1)', undefined, ['/a']]) {
      expect(destinoSeguro(valor)).toBe('/')
    }
  })
})
