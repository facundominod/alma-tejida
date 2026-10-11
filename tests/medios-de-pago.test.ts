import { describe, expect, it } from 'vitest'
import {
  calcularPreciosDePago,
  porcentajeDesdePrecio,
  precioSegunMedio,
  COPY_PAGO,
} from '@/lib/medios-de-pago'

describe('calcularPreciosDePago', () => {
  it('aplica el 20 % por defecto sobre el precio de tarjeta', () => {
    const p = calcularPreciosDePago({ precioTarjeta: 215_000, porcentajeContado: 20, cuotas: 3 })

    expect(p.tarjeta).toBe(215_000)
    expect(p.contado).toBe(172_000)
    expect(p.ahorro).toBe(43_000)
    expect(p.hayDescuento).toBe(true)
  })

  it('sin descuento, los dos precios son el mismo y no anuncia nada', () => {
    const p = calcularPreciosDePago({ precioTarjeta: 215_000, porcentajeContado: 0 })

    expect(p.contado).toBe(p.tarjeta)
    expect(p.ahorro).toBe(0)
    expect(p.hayDescuento).toBe(false)
  })

  it('las cuotas suman al menos el total, nunca menos', () => {
    // 100.000 / 3 = 33.333,33. Si se redondeara hacia abajo, tres cuotas
    // sumarian 99.999 y la clienta leeria que le falta un peso.
    const p = calcularPreciosDePago({ precioTarjeta: 100_000, porcentajeContado: 20, cuotas: 3 })

    expect(p.valorCuota * p.cuotas).toBeGreaterThanOrEqual(p.tarjeta)
  })

  it('no devuelve centavos', () => {
    const p = calcularPreciosDePago({ precioTarjeta: 99_999, porcentajeContado: 17.5 })

    expect(Number.isInteger(p.tarjeta)).toBe(true)
    expect(Number.isInteger(p.contado)).toBe(true)
    expect(Number.isInteger(p.ahorro)).toBe(true)
  })

  it('el ahorro cierra exacto contra los dos precios', () => {
    for (const precio of [1_000, 37_500, 215_000, 1_234_567]) {
      for (const pct of [0, 5, 12.5, 20, 33.33]) {
        const p = calcularPreciosDePago({ precioTarjeta: precio, porcentajeContado: pct })
        expect(p.contado + p.ahorro).toBe(p.tarjeta)
      }
    }
  })

  it('un porcentaje imposible se ignora en vez de regalar la pieza', () => {
    // La base lo impide, pero esta cuenta tambien corre contra un formulario
    // a medio llenar.
    for (const pct of [100, 150, 9999]) {
      const p = calcularPreciosDePago({ precioTarjeta: 215_000, porcentajeContado: pct })
      expect(p.contado).toBe(215_000)
      expect(p.hayDescuento).toBe(false)
    }
  })

  it('no propaga NaN ni negativos', () => {
    for (const malo of [null, undefined, NaN, -50, 'hola']) {
      const p = calcularPreciosDePago({
        precioTarjeta: malo as number,
        porcentajeContado: malo as number,
        cuotas: malo as number,
      })
      expect(Number.isFinite(p.tarjeta)).toBe(true)
      expect(Number.isFinite(p.contado)).toBe(true)
      expect(p.contado).toBeGreaterThanOrEqual(0)
      expect(p.cuotas).toBeGreaterThanOrEqual(1)
    }
  })

  it('acepta el precio como texto, que es como llega de la base', () => {
    const p = calcularPreciosDePago({ precioTarjeta: '215000.00', porcentajeContado: '20.00' })
    expect(p.contado).toBe(172_000)
  })

  it('no anuncia un ahorro de cero pesos', () => {
    // 1 % de 40 pesos redondea a cero. Decir "ahorras $0" es peor que callarse.
    const p = calcularPreciosDePago({ precioTarjeta: 40, porcentajeContado: 1 })
    expect(p.ahorro).toBe(0)
    expect(p.hayDescuento).toBe(false)
  })
})

describe('porcentajeDesdePrecio', () => {
  it('va y vuelve: el porcentaje calculado reproduce el precio escrito', () => {
    const pct = porcentajeDesdePrecio({ precioTarjeta: 215_000, precioContado: 172_000 })
    expect(pct).toBe(20)

    const vuelta = calcularPreciosDePago({ precioTarjeta: 215_000, porcentajeContado: pct })
    expect(vuelta.contado).toBe(172_000)
  })

  it('un precio redondo vuelve EXACTO, aunque el porcentaje tenga decimales', () => {
    // El caso que importa: Silvana escribe "180.000 por transferencia". El
    // porcentaje que sale es 16,28 % y la cuenta cruda da 179.998. Redondeando
    // a la centena vuelve clavado en 180.000.
    const pct = porcentajeDesdePrecio({ precioTarjeta: 215_000, precioContado: 180_000 })
    expect(pct).toBe(16.28)

    const vuelta = calcularPreciosDePago({ precioTarjeta: 215_000, porcentajeContado: pct })
    expect(vuelta.contado).toBe(180_000)
  })

  it('cualquier precio multiplo de 100 vuelve exacto en el rango de la tienda', () => {
    // No un caso: el rango entero. Es la propiedad de la que depende que el
    // panel pueda ofrecer "escribi el precio que queres cobrar".
    for (let tarjeta = 50_000; tarjeta <= 400_000; tarjeta += 7_300) {
      for (let contado = Math.round((tarjeta * 0.5) / 100) * 100; contado < tarjeta; contado += 4_100) {
        const pct = porcentajeDesdePrecio({ precioTarjeta: tarjeta, precioContado: contado })
        const vuelta = calcularPreciosDePago({ precioTarjeta: tarjeta, porcentajeContado: pct })
        expect(vuelta.contado).toBe(contado)
      }
    }
  })

  it('un precio de contado mayor al de tarjeta no es descuento', () => {
    expect(porcentajeDesdePrecio({ precioTarjeta: 100_000, precioContado: 120_000 })).toBeNull()
  })

  it('devuelve nulo con datos que no sirven', () => {
    expect(porcentajeDesdePrecio({ precioTarjeta: 0, precioContado: 100 })).toBeNull()
    expect(porcentajeDesdePrecio({ precioTarjeta: 100, precioContado: 0 })).toBeNull()
    expect(porcentajeDesdePrecio({ precioTarjeta: null, precioContado: null })).toBeNull()
  })
})

describe('precioSegunMedio', () => {
  const p = calcularPreciosDePago({ precioTarjeta: 215_000, porcentajeContado: 20, cuotas: 3 })

  it('transferencia y efectivo cobran lo mismo', () => {
    expect(precioSegunMedio(p, 'transferencia')).toBe(p.contado)
    expect(precioSegunMedio(p, 'efectivo')).toBe(p.contado)
  })

  it('tarjeta cobra el precio de lista', () => {
    expect(precioSegunMedio(p, 'tarjeta')).toBe(p.tarjeta)
  })
})

describe('COPY_PAGO', () => {
  it('nombra las cuotas en plural solo cuando hay mas de una', () => {
    const tres = calcularPreciosDePago({ precioTarjeta: 90_000, porcentajeContado: 20, cuotas: 3 })
    const una = calcularPreciosDePago({ precioTarjeta: 90_000, porcentajeContado: 20, cuotas: 1 })

    expect(COPY_PAGO.cuotasSinInteres(tres)).toContain('3 cuotas sin interés')
    expect(COPY_PAGO.cuotasSinInteres(una)).toBe('un pago')
  })

  it('el ahorro anunciado es el mismo numero que se calculo', () => {
    const p = calcularPreciosDePago({ precioTarjeta: 215_000, porcentajeContado: 20 })
    // 43.000 formateado lleva separador de miles: se busca el numero, no el texto.
    expect(COPY_PAGO.ahorroLargo(p)).toContain('43.000')
  })
})

describe('redondeo del precio de contado', () => {
  it('sin descuento no inventa un recargo', () => {
    // Una pieza de 99.999 sin descuento no puede "costar" 100.000 al contado.
    const p = calcularPreciosDePago({ precioTarjeta: 99_999, porcentajeContado: 0 })
    expect(p.contado).toBe(99_999)
    expect(p.ahorro).toBe(0)
  })

  it('el contado nunca sale mas caro que la tarjeta', () => {
    for (let precio = 10_000; precio <= 500_000; precio += 1_111) {
      for (const pct of [0.01, 0.1, 1, 20, 99]) {
        const p = calcularPreciosDePago({ precioTarjeta: precio, porcentajeContado: pct })
        expect(p.contado).toBeLessThanOrEqual(p.tarjeta)
        expect(p.ahorro).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('una pieza barata no se va a cero', () => {
    // Redondeando a la centena, 40 pesos al 20 % daria 0.
    const p = calcularPreciosDePago({ precioTarjeta: 500, porcentajeContado: 20 })
    expect(p.contado).toBe(400)
  })

  it('el cartel dice el descuento real, no el guardado', () => {
    // Guardado 16,28 %; cobrado 180.000 sobre 215.000 = 16,27 % -> redondea a 16.
    const p = calcularPreciosDePago({ precioTarjeta: 215_000, porcentajeContado: 16.28 })
    expect(p.contado).toBe(180_000)
    expect(p.porcentaje).toBe(16)
  })
})
