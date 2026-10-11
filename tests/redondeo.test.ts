import { describe, expect, it } from 'vitest'
import { redondearA99, PISO_PARA_REDONDEAR } from '@/lib/redondeo'

describe('redondearA99', () => {
  it('hace lo que pidió Silvana: 45.760 queda en 45.799', () => {
    expect(redondearA99(45_760)!.precio).toBe(45_799)
  })

  it('va a la centena más cercana, no siempre para arriba', () => {
    // 45.710 está más cerca de 45.700 que de 45.800.
    expect(redondearA99(45_710)!.precio).toBe(45_699)
    expect(redondearA99(45_790)!.precio).toBe(45_799)
  })

  it('un precio redondo grande también termina en 99', () => {
    expect(redondearA99(150_000)!.precio).toBe(149_999)
    expect(redondearA99(215_000)!.precio).toBe(214_999)
  })

  it('el resultado SIEMPRE termina en 99', () => {
    for (let p = PISO_PARA_REDONDEAR; p < 500_000; p += 731) {
      const r = redondearA99(p)
      if (r) expect(r.precio % 100).toBe(99)
    }
  })

  it('nunca mueve el precio más de 50 pesos', () => {
    // Es la consecuencia de ir a la centena más cercana. Si alguna vez se
    // moviera más, el redondeo estaría cambiando el precio y no puliéndolo.
    for (let p = PISO_PARA_REDONDEAR; p < 500_000; p += 517) {
      const r = redondearA99(p)
      if (r) expect(Math.abs(r.diferencia)).toBeLessThanOrEqual(50)
    }
  })

  /**
   * LA PRUEBA QUE IMPORTA.
   *
   * Hay doce piezas cargadas con precio $1 como valor provisorio. Sin piso,
   * una tanda las habría dejado en $99 a todas: noventa y nueve veces más
   * caras, de un click, sin vuelta atrás.
   */
  it('no toca las piezas con precio provisorio', () => {
    for (const provisorio of [1, 5, 50, 99, 500, 999]) {
      expect(redondearA99(provisorio)).toBeNull()
    }
  })

  it('no hace nada si ya termina en 99', () => {
    expect(redondearA99(45_799)).toBeNull()
    expect(redondearA99(149_999)).toBeNull()
  })

  it('no se rompe con basura', () => {
    for (const malo of [null, undefined, NaN, Infinity, 'hola', '']) {
      expect(redondearA99(malo as number)).toBeNull()
    }
  })

  it('acepta el precio como texto, que es como viene de la base', () => {
    expect(redondearA99('45760.00')!.precio).toBe(45_799)
  })

  it('la diferencia cierra contra el precio original', () => {
    for (const p of [1_000, 45_760, 150_000, 237_412]) {
      const r = redondearA99(p)
      if (r) expect(p + r.diferencia).toBe(r.precio)
    }
  })
})
