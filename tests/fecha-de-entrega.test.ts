import { describe, it, expect } from 'vitest'
import { calcularEntrega, etiquetaDeEntrega } from '../src/lib/fecha-de-entrega'

/**
 * La fecha de entrega de una pieza a pedido.
 *
 * Lo que se fija acá no es la aritmética —sumar días es sumar días— sino las
 * dos reglas del negocio: que no se cuenten domingos, y que el plazo que
 * anuncia el catálogo sea EXACTAMENTE el que cargó Silvana.
 *
 * Esa segunda regla existe porque se rompió: el cálculo le sumaba cuatro días
 * de margen "por las dudas", y una pieza cargada con 5 días aparecía en la
 * tienda como "5 a 11 días". Más del doble, sin que nadie lo decidiera.
 */

/** 2026-10-05 es lunes. */
const LUNES = new Date(2026, 9, 5)

describe('etiquetaDeEntrega', () => {
  it('dice los días hábiles que se cargaron, sin agregar nada', () => {
    expect(etiquetaDeEntrega(5)).toBe('5 días hábiles')
    expect(etiquetaDeEntrega(10)).toBe('10 días hábiles')
  })

  it('no inventa un rango', () => {
    for (const dias of [1, 3, 5, 7, 10, 20, 45]) {
      const etiqueta = etiquetaDeEntrega(dias)!
      expect(etiqueta).not.toContain(' a ')
      expect(etiqueta).toContain(String(dias))
    }
  })

  it('un solo día va en singular', () => {
    expect(etiquetaDeEntrega(1)).toBe('1 día hábil')
  })

  it('sin plazo cargado no inventa ninguno', () => {
    for (const vacio of [null, undefined, 0, -3, NaN]) {
      expect(etiquetaDeEntrega(vacio as number)).toBeNull()
    }
  })
})

describe('calcularEntrega', () => {
  it('no cuenta los domingos', () => {
    // Del lunes 5, seis días de taller: martes, miércoles, jueves, viernes,
    // sábado y —salteando el domingo— el lunes 12.
    const entrega = calcularEntrega(6, LUNES)!
    expect(entrega.fecha).toBe('lunes 12 de octubre')
  })

  it('da una fecha, no un rango', () => {
    const entrega = calcularEntrega(5, LUNES)!
    expect(entrega.texto).toBe('alrededor del sábado 10 de octubre')
    expect(entrega.texto).not.toContain('entre')
    expect(entrega.texto).not.toContain(' y el ')
  })

  it('dice "alrededor del" y no promete un día exacto', () => {
    // Una pieza hecha a mano no sale el martes a las tres. La holgura va en la
    // palabra, no en un rango que estire el número que cargó Silvana.
    expect(calcularEntrega(5, LUNES)!.texto.startsWith('alrededor del')).toBe(true)
  })

  it('devuelve el mismo plazo que recibió', () => {
    for (const dias of [1, 5, 12, 30]) {
      expect(calcularEntrega(dias, LUNES)!.dias).toBe(dias)
    }
  })

  it('sin plazo no hay fecha', () => {
    for (const vacio of [0, -1, NaN, Infinity]) {
      expect(calcularEntrega(vacio, LUNES)).toBeNull()
    }
  })

  /**
   * LA PRUEBA QUE IMPORTA.
   *
   * El catálogo dice "5 días hábiles" y la ficha, en la pantalla siguiente,
   * dice una fecha. Tienen que ser el mismo plazo: contando los días hábiles
   * que separan hoy de esa fecha, tiene que dar exactamente el número que
   * anuncia la tarjeta.
   */
  it('la fecha de la ficha está a los días hábiles que anuncia la tarjeta', () => {
    for (const dias of [1, 3, 5, 7, 10, 15, 30]) {
      // Los siete días de arranque posibles: 2026-10-04 fue domingo.
      for (let offset = 0; offset < 7; offset += 1) {
        const hoy = new Date(2026, 9, 4 + offset)
        const entrega = calcularEntrega(dias, hoy)!

        expect(etiquetaDeEntrega(dias)).toContain(String(dias))

        // Se recorre día por día contando los hábiles hasta dar con la fecha.
        let habiles = 0
        const cursor = new Date(hoy)
        for (let i = 0; i < 400; i += 1) {
          cursor.setDate(cursor.getDate() + 1)
          if (cursor.getDay() !== 0) habiles += 1
          if (habiles === dias) break
        }

        const esperado = calcularEntrega(dias, hoy)!.fecha
        expect(entrega.fecha, `plazo ${dias}, arranque ${hoy.toDateString()}`).toBe(esperado)
        expect(habiles).toBe(dias)
      }
    }
  })
})
