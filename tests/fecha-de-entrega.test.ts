import { describe, it, expect } from 'vitest'
import { calcularEntrega } from '../src/lib/fecha-de-entrega'

/**
 * La fecha de entrega de una pieza a pedido.
 *
 * Es una promesa a alguien que está por gastar plata, así que lo que importa
 * no es que la cuenta dé: es que NO PROMETA DE MENOS. Un día de más no
 * molesta a nadie; un día de menos es una clienta esperando algo que no
 * llegó.
 */
describe('fecha de entrega', () => {
  /** Lunes 5 de octubre de 2026. Verificado, no supuesto. */
  const lunes = new Date(2026, 9, 5)

  it('cuenta los días a partir de hoy', () => {
    const entrega = calcularEntrega(3, lunes)
    // Lunes 5 + 3 dias de taller = jueves 8.
    expect(entrega?.desde).toBe('jueves 8 de octubre')
  })

  /**
   * LA QUE IMPORTA.
   *
   * Contando días corridos, 6 días desde el lunes 5 caen el domingo 11, y el
   * taller no teje los domingos: esa fecha seria una promesa que nadie puede
   * cumplir. Saltando el domingo cae el lunes 12.
   */
  it('no cuenta los domingos', () => {
    const entrega = calcularEntrega(6, lunes)
    expect(entrega?.desde).toBe('lunes 12 de octubre')
    expect(entrega?.desde).not.toContain('domingo')
  })

  it('nunca cae un domingo, para ningún plazo', () => {
    for (let dias = 1; dias <= 60; dias += 1) {
      const entrega = calcularEntrega(dias, lunes)
      expect(entrega?.desde, `${dias} dias cayo domingo`).not.toContain('domingo')
      expect(entrega?.hasta, `${dias} dias cayo domingo`).not.toContain('domingo')
    }
  })

  it('da un rango y no un día exacto', () => {
    const entrega = calcularEntrega(10, lunes)
    // Una pieza hecha a mano no sale el martes a las tres.
    expect(entrega?.desde).not.toBe(entrega?.hasta)
    expect(entrega?.texto).toContain('entre el')
  })

  it('no repite el mes cuando las dos fechas caen en el mismo', () => {
    const entrega = calcularEntrega(3, lunes)
    expect(entrega?.texto).toBe('entre el jueves 8 y el martes 13 de octubre')
  })

  it('nombra los dos meses cuando el rango los cruza', () => {
    const entrega = calcularEntrega(22, lunes)
    expect(entrega?.texto).toContain('octubre')
    expect(entrega?.texto).toContain('noviembre')
  })

  it('devuelve nulo si no hay plazo cargado', () => {
    // Sin plazo no se inventa una fecha: la pieza dice "a pedido" y listo.
    expect(calcularEntrega(0, lunes)).toBeNull()
    expect(calcularEntrega(-5, lunes)).toBeNull()
    expect(calcularEntrega(Number.NaN, lunes)).toBeNull()
  })
})
