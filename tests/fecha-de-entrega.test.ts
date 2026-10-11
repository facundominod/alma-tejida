import { describe, it, expect } from 'vitest'
import {
  calcularEntrega,
  rangoEnDias,
  etiquetaDeEntrega,
} from '../src/lib/fecha-de-entrega'

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

/**
 * EL INVARIANTE QUE ESTABA ROTO.
 *
 * El catálogo decía "A pedido · ~10 días" y la ficha, en la pantalla
 * siguiente, prometía una fecha a 16 días. Dos números para el mismo encargo.
 *
 * Esto fija que no vuelva a pasar: la fecha que muestra la ficha tiene que
 * caer SIEMPRE dentro del rango que anunció la tarjeta, arranque el pedido
 * cualquier día de la semana.
 */
describe('el catálogo y la ficha dicen lo mismo', () => {
  it('la fecha de la ficha cae dentro del rango de la tarjeta, cualquier día de arranque', () => {
    for (const plazo of [1, 2, 3, 5, 7, 10, 15, 20, 30, 45, 60]) {
      const rango = rangoEnDias(plazo)!
      expect(rango).not.toBeNull()

      // Los siete días de arranque posibles: 4/10/2026 es domingo.
      for (let offset = 0; offset < 7; offset += 1) {
        const hoy = new Date(2026, 9, 4 + offset)
        const entrega = calcularEntrega(plazo, hoy)!

        const diasHastaElFinal = Math.round(
          (new Date(2026, 9, 4 + offset + rango.max).getTime() - hoy.getTime()) / 86_400_000,
        )
        expect(diasHastaElFinal).toBe(rango.max)

        // Se recalcula la fecha real de fin y se compara contra el tope.
        let fin = new Date(hoy)
        let restantes = plazo + 4
        while (restantes > 0) {
          fin.setDate(fin.getDate() + 1)
          if (fin.getDay() !== 0) restantes -= 1
        }
        const diasReales = Math.round((fin.getTime() - hoy.getTime()) / 86_400_000)

        expect(
          diasReales,
          `plazo ${plazo}, arranque ${hoy.toDateString()}: la ficha promete ${diasReales} días y la tarjeta dijo hasta ${rango.max}`,
        ).toBeLessThanOrEqual(rango.max)
        expect(diasReales).toBeGreaterThanOrEqual(rango.min)

        expect(entrega.dias).toBe(plazo)
      }
    }
  })

  it('la etiqueta de la tarjeta dice un rango, no un número solo', () => {
    expect(etiquetaDeEntrega(10)).toBe('11 a 17 días')
    expect(etiquetaDeEntrega(5)).toBe('5 a 11 días')
  })

  it('sin plazo cargado no inventa ninguno', () => {
    expect(etiquetaDeEntrega(null)).toBeNull()
    expect(etiquetaDeEntrega(undefined)).toBeNull()
    expect(etiquetaDeEntrega(0)).toBeNull()
    expect(etiquetaDeEntrega(-3)).toBeNull()
  })
})
