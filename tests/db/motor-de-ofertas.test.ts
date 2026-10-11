import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, seedBasics, type Db } from './harness'

/**
 * El motor de ofertas (migraciones 0024, 0025 y 0027).
 *
 * Esto maneja plata de verdad, así que lo que se fija acá no es que la cuenta
 * dé: es que NO pueda cobrar de menos en silencio. Cada prueba es un caso con
 * cifras que se pueden verificar a mano.
 */
describe('motor de ofertas', () => {
  let pg: Db
  let ids: Awaited<ReturnType<typeof seedBasics>>

  beforeEach(async () => {
    pg = await createTestDb()
    ids = await seedBasics(pg)
    await pg.asService()
    // Un respaldo de $215.000, con costo de $90.000.
    await pg.query(
      `update public.products
          set base_price = 215000, base_cost = 90000, cash_discount_percent = 20
        where id = $1`,
      [ids.productId],
    )
    await pg.query(`update public.product_variants set price_override = null where id = $1`, [
      ids.variantId,
    ])
  })

  afterEach(async () => {
    await pg?.close()
  })

  type Fila = {
    precio_unitario: string
    total: string
    descuento_percent: number
    ahorro_unitario: string
    ganancia_unitaria: string | null
    margen_percent: number | null
    reglas_aplicadas: Array<{ motivo: string; porcentaje: number }>
    tope_alcanzado: boolean
  }

  const precio = (cantidad = 1, medio = 'transferencia', reglas: unknown = null) =>
    pg.one<Fila>(
      `select * from public.precio_con_reglas($1::uuid, null, $2::integer, $3::text, $4::jsonb)`,
      [ids.productId, cantidad, medio, reglas ? JSON.stringify(reglas) : null],
    )

  it('sin reglas, sólo el descuento de contado de siempre', async () => {
    const r = (await precio(1, 'transferencia'))!
    expect(Number(r.precio_unitario)).toBe(172_000) // 215.000 menos 20 %
  })

  it('con tarjeta no hay descuento de contado', async () => {
    const r = (await precio(1, 'tarjeta'))!
    expect(Number(r.precio_unitario)).toBe(215_000)
  })

  /**
   * LA CUENTA CONCRETA: respaldo de $215.000, dos unidades, 25 % por llevar
   * dos o más, pagando en efectivo.
   */
  it('acumula multiplicando, no sumando', async () => {
    const reglas = [{ kind: 'cantidad', min_quantity: 2, discount_percent: 25 }]
    const r = (await precio(2, 'efectivo', reglas))!

    // 215.000 x 0,75 x 0,80 = 129.000. Sumando 25+20 = 45 % daría 118.250:
    // $21.500 menos en un pedido de dos piezas.
    expect(Number(r.precio_unitario)).toBe(129_000)
    expect(Number(r.total)).toBe(258_000)
    expect(r.descuento_percent).toBe(40)
  })

  it('la ganancia sale del costo cargado', async () => {
    const r = (await precio(2, 'efectivo', [
      { kind: 'cantidad', min_quantity: 2, discount_percent: 25 },
    ]))!

    expect(Number(r.ganancia_unitaria)).toBe(39_000) // 129.000 menos 90.000
    expect(r.margen_percent).toBe(30)
  })

  it('sin costo cargado no inventa una ganancia', async () => {
    await pg.query(`update public.products set base_cost = null where id = $1`, [
      ids.productId,
    ])
    const r = (await precio(1))!
    expect(r.ganancia_unitaria).toBeNull()
    expect(r.margen_percent).toBeNull()
  })

  it('la regla por cantidad no se aplica si no se alcanza', async () => {
    const reglas = [{ kind: 'cantidad', min_quantity: 3, discount_percent: 25 }]
    const r = (await precio(2, 'efectivo', reglas))!
    expect(Number(r.precio_unitario)).toBe(172_000) // sólo el 20 % de contado
  })

  /** Dos escalones cargados no se suman: gana el que corresponde. */
  it('los escalones de cantidad no se acumulan entre sí', async () => {
    const reglas = [
      { kind: 'cantidad', min_quantity: 2, discount_percent: 25 },
      { kind: 'cantidad', min_quantity: 5, discount_percent: 35 },
    ]
    const r = (await precio(5, 'tarjeta', reglas))!

    // 215.000 x 0,65 = 139.750, redondeado a la centena 139.800.
    // Acumulando los dos daría 215.000 x 0,75 x 0,65 = 104.800.
    expect(Number(r.precio_unitario)).toBe(139_800)
  })

  /**
   * LA PRUEBA QUE IMPORTA (1): una regla de pago REEMPLAZA el descuento de
   * contado por defecto. Acumularlos daba 32 % cuando lo que se quiso decir
   * fue 15.
   */
  it('una regla de pago reemplaza al descuento de contado, no se suma', async () => {
    const reglas = [
      { kind: 'medio_de_pago', payment_method: 'efectivo', discount_percent: 15 },
    ]
    const r = (await precio(1, 'efectivo', reglas))!

    // Con 15 en lugar de 20, el de siempre es MEJOR y gana: 172.000.
    expect(Number(r.precio_unitario)).toBe(172_000)
  })

  it('pero se puede pedir que se acumule', async () => {
    const reglas = [
      {
        kind: 'medio_de_pago',
        payment_method: 'efectivo',
        discount_percent: 15,
        payment_mode: 'ademas',
      },
    ]
    const r = (await precio(1, 'efectivo', reglas))!

    // 215.000 x 0,85 x 0,80 = 146.200
    expect(Number(r.precio_unitario)).toBe(146_200)
  })

  /** LA PRUEBA QUE IMPORTA (2): el tope frena cualquier combinación. */
  it('ninguna combinación pasa del tope de la tienda', async () => {
    await pg.query(`update public.store_settings set max_discount_percent = 40`)

    const reglas = [
      { kind: 'cantidad', min_quantity: 2, discount_percent: 40 },
      {
        kind: 'medio_de_pago',
        payment_method: 'efectivo',
        discount_percent: 30,
        payment_mode: 'ademas',
      },
    ]
    const r = (await precio(2, 'efectivo', reglas))!

    expect(r.tope_alcanzado).toBe(true)
    expect(Number(r.precio_unitario)).toBe(129_000) // 215.000 menos 40 %
  })

  /**
   * LA PRUEBA QUE IMPORTA (3): una pieza con el precio anclado en contado no
   * puede SUBIR de precio por una promoción de medio de pago.
   */
  it('una pieza anclada en contado no entra en las reglas de pago', async () => {
    await pg.query(`update public.products set price_basis = 'contado' where id = $1`, [
      ids.productId,
    ])

    const reglas = [
      {
        kind: 'medio_de_pago',
        payment_method: 'efectivo',
        discount_percent: 15,
        payment_mode: 'ademas',
      },
    ]
    const conRegla = (await precio(1, 'efectivo', reglas))!
    const sinRegla = (await precio(1, 'efectivo'))!

    expect(Number(conRegla.precio_unitario)).toBe(Number(sinRegla.precio_unitario))
  })

  /** El total es el unitario por la cantidad: las líneas siempre cierran. */
  it('el total es exactamente el unitario por la cantidad', async () => {
    for (const cantidad of [1, 2, 3, 7]) {
      const r = (await precio(cantidad, 'efectivo', [
        { kind: 'cantidad', min_quantity: 2, discount_percent: 25 },
      ]))!
      expect(Number(r.total)).toBe(Number(r.precio_unitario) * cantidad)
    }
  })

  it('dice qué descuentos se aplicaron, para poder mostrarlos', async () => {
    const r = (await precio(2, 'efectivo', [
      { kind: 'cantidad', min_quantity: 2, discount_percent: 25 },
    ]))!

    const motivos = r.reglas_aplicadas.map((x) => x.motivo)
    expect(motivos).toContain('Por llevar 2 o más')
    expect(motivos).toContain('Transferencia o efectivo')
  })

  it('nunca deja el precio en cero ni por encima del de lista', async () => {
    const reglas = [
      { kind: 'cantidad', min_quantity: 2, discount_percent: 99 },
      {
        kind: 'medio_de_pago',
        payment_method: 'efectivo',
        discount_percent: 99,
        payment_mode: 'ademas',
      },
    ]
    const r = (await precio(2, 'efectivo', reglas))!

    expect(Number(r.precio_unitario)).toBeGreaterThan(0)
    expect(Number(r.precio_unitario)).toBeLessThanOrEqual(215_000)
  })

  it('una pieza que no existe no devuelve nada, no explota', async () => {
    const r = await pg.rows(
      `select * from public.precio_con_reglas(gen_random_uuid(), null, 1, 'efectivo')`,
    )
    expect(r).toHaveLength(0)
  })
})
