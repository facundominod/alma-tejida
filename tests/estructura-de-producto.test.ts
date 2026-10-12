import { describe, expect, it } from 'vitest'
import { structureSchema } from '@/lib/actions/admin/esquemas'
import { parsearPrecio } from '@/lib/parsear-precio'

/**
 * El contrato entre el formulario de variantes y el validador que lo recibe.
 *
 * EL ERROR QUE ESTAS PRUEBAS IMPIDEN QUE VUELVA
 * El formulario manda el precio pasado por parsearPrecio(), o sea un NUMERO.
 * El validador exigia texto. Un numero no pasaba, y cuando la validacion
 * falla no se guarda NADA: ni los precios, ni los SKU, ni las combinaciones.
 *
 * Solo mordia con un precio escrito -con el campo vacio llega null, que si
 * pasaba-, asi que las piezas simples se guardaban bien y el respaldo a
 * medida, donde cada una de las 42 combinaciones lleva su precio propio, no
 * se guardaba nunca. Desde el panel se veia como "le pongo el precio, guardo
 * y no se actualiza".
 */

const ID = '11111111-1111-4111-8111-111111111111'

function conPrecio(price_override: unknown) {
  return {
    productId: ID,
    attributes: [],
    variants: [{ id: null, options: { medida: '1,20' }, sku: null, price_override }],
  }
}

describe('el precio de una combinación', () => {
  it('entra como número, que es lo que manda el formulario', () => {
    const r = structureSchema.safeParse(conPrecio(215000))
    expect(r.success).toBe(true)
    expect(r.success && r.data.variants[0].price_override).toBe('215000')
  })

  it('entra como el texto que escribe una persona, ya interpretado', () => {
    // Tal cual viaja desde el campo: "215.000" → 215000.
    const r = structureSchema.safeParse(conPrecio(parsearPrecio('215.000')))
    expect(r.success && r.data.variants[0].price_override).toBe('215000')
  })

  it('entra con decimales', () => {
    const r = structureSchema.safeParse(conPrecio(parsearPrecio('215.000,50')))
    expect(r.success && r.data.variants[0].price_override).toBe('215000.5')
  })

  it('vacío significa que sigue al precio de la pieza', () => {
    for (const vacio of [null, undefined, '']) {
      const r = structureSchema.safeParse(conPrecio(vacio))
      expect(r.success).toBe(true)
      expect(r.success && r.data.variants[0].price_override).toBeNull()
    }
  })

  it('la clave que el formulario no manda no rompe nada', () => {
    // El formulario de variantes no manda `low_stock_threshold`. El primer
    // intento de arreglo exigia la clave sin querer, y asi arreglar el precio
    // rompia el guardado entero.
    const r = structureSchema.safeParse({
      productId: ID,
      attributes: [],
      variants: [{ id: null, options: { medida: '1,20' }, sku: null, price_override: 215000 }],
    })
    expect(r.success).toBe(true)
    expect(r.success && r.data.variants[0].low_stock_threshold).toBeNull()
  })

  it('sale siempre como texto, que es lo que espera la base', () => {
    const r = structureSchema.safeParse(conPrecio(320000))
    const v = r.success ? r.data.variants[0].price_override : undefined
    expect(typeof v).toBe('string')
  })

  it('las 42 combinaciones del respaldo pasan juntas', () => {
    const precios = Array.from({ length: 42 }, (_, i) => 150000 + i * 4000)
    const r = structureSchema.safeParse({
      productId: ID,
      attributes: [],
      variants: precios.map((p, i) => ({
        id: null,
        options: { medida: `m${i}` },
        sku: null,
        price_override: p,
      })),
    })
    expect(r.success).toBe(true)
    expect(r.success && r.data.variants.map((v) => v.price_override)).toEqual(
      precios.map(String),
    )
  })
})
