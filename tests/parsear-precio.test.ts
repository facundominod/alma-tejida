import { describe, expect, it } from 'vitest'
import { parsearPrecio, formatearParaEditar } from '@/lib/parsear-precio'

describe('parsearPrecio', () => {
  /**
   * LA PRUEBA QUE IMPORTA.
   *
   * Estas cuatro formas son las que una persona escribe de verdad en un campo
   * de precio en Argentina. Con `<input type="number">`, dos de ellas trababan
   * el formulario y una guardaba 150 en lugar de 150.000.
   */
  it('entiende un precio escrito como se escribe acá', () => {
    expect(parsearPrecio('150.000')).toBe(150_000)
    expect(parsearPrecio('150000')).toBe(150_000)
    expect(parsearPrecio('$150.000')).toBe(150_000)
    expect(parsearPrecio('$ 150.000')).toBe(150_000)
  })

  it('la coma es el decimal, el punto son los miles', () => {
    expect(parsearPrecio('1.500,50')).toBe(1500.5)
    expect(parsearPrecio('1500,50')).toBe(1500.5)
    expect(parsearPrecio('150.000,00')).toBe(150_000)
    expect(parsearPrecio('1.234.567,89')).toBeCloseTo(1_234_567.89, 2)
  })

  it('el caso ambiguo se resuelve por los dígitos que siguen al punto', () => {
    // Tres dígitos: miles. Es lo que se quiso escribir en una tienda donde
    // nada cuesta menos de mil pesos.
    expect(parsearPrecio('45.760')).toBe(45_760)
    expect(parsearPrecio('1.234.000')).toBe(1_234_000)

    // Uno o dos: decimales a la inglesa.
    expect(parsearPrecio('150.5')).toBe(150.5)
    expect(parsearPrecio('150.50')).toBe(150.5)
  })

  it('aguanta lo que llega al pegar desde una planilla', () => {
    expect(parsearPrecio('  150.000  ')).toBe(150_000)
    expect(parsearPrecio(' 150.000')).toBe(150_000)
    expect(parsearPrecio('AR$ 150.000')).toBe(150_000)
  })

  it('vacío es nulo, no cero', () => {
    // Cero es un precio; vacío es "no lo escribí". Confundirlos es lo que
    // hacía que un campo rechazado se guardara como $0.
    for (const vacio of ['', '   ', null, undefined, '$', '-']) {
      expect(parsearPrecio(vacio as string)).toBeNull()
    }
  })

  it('un número ya numérico pasa de largo', () => {
    expect(parsearPrecio(150_000)).toBe(150_000)
    expect(parsearPrecio(0)).toBe(0)
    expect(parsearPrecio(NaN)).toBeNull()
  })

  it('va y vuelve: lo que se formatea se vuelve a leer igual', () => {
    for (const n of [0, 1, 999, 1_000, 45_760, 150_000, 1_234_567]) {
      expect(parsearPrecio(formatearParaEditar(n))).toBe(n)
    }
  })
})

describe('formatearParaEditar', () => {
  it('escribe el número como se lee', () => {
    expect(formatearParaEditar(150_000)).toBe('150.000')
    expect(formatearParaEditar(1_234_567)).toBe('1.234.567')
  })

  it('no inventa decimales', () => {
    expect(formatearParaEditar(150_000)).not.toContain(',')
  })

  it('vacío se queda vacío', () => {
    expect(formatearParaEditar(null)).toBe('')
    expect(formatearParaEditar(undefined)).toBe('')
    expect(formatearParaEditar(NaN)).toBe('')
  })
})

/**
 * LA COMA TAMBIÉN ES AMBIGUA, Y SE RESUELVE POR LOS DECIMALES.
 *
 * "150,000" parece ciento cincuenta con tres decimales. Pero un precio con
 * tres decimales no existe: eso es un separador de miles a la inglesa, que es
 * lo que sale de un teclado de teléfono o de copiar y pegar de cualquier lado.
 */
describe('la coma: decimal o miles', () => {
  it('con tres dígitos detrás y sin punto, la coma son miles', () => {
    expect(parsearPrecio('150,000')).toBe(150_000)
    expect(parsearPrecio('45,760')).toBe(45_760)
  })

  it('con más de una coma, todas son miles', () => {
    expect(parsearPrecio('1,500,000')).toBe(1_500_000)
  })

  it('con uno o dos dígitos detrás, la coma es el decimal', () => {
    expect(parsearPrecio('150,5')).toBe(150.5)
    expect(parsearPrecio('150,50')).toBe(150.5)
    expect(parsearPrecio('1500,50')).toBe(1500.5)
  })

  it('si hay punto y coma, la coma manda como decimal', () => {
    expect(parsearPrecio('150.000,00')).toBe(150_000)
    expect(parsearPrecio('1.500,50')).toBe(1500.5)
  })
})
