import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, seedBasics, type Db } from './harness'

/**
 * Medios de pago (migración 0018).
 *
 * Lo que hay que demostrar acá es la regla de resolución: nulo en la pieza
 * significa "el descuento de la tienda", y cero significa "esta pieza no tiene
 * descuento". Son dos cosas distintas y es fácil que se confundan —`||` en
 * lugar de `??` ya alcanza—, con el resultado de que una pieza marcada
 * expresamente sin descuento empiece a venderse 20 % más barata.
 */
describe('medios de pago', () => {
  let pg: Db
  let ids: Awaited<ReturnType<typeof seedBasics>>

  beforeEach(async () => {
    pg = await createTestDb()
    ids = await seedBasics(pg)
    await pg.asService()
  })

  afterEach(async () => {
    await pg?.close()
  })

  async function descuentoEnLaVista() {
    const fila = await pg.one<{ cash_discount_percent: string; card_installments: number }>(
      `select cash_discount_percent, card_installments
         from public.v_catalog_products where id = $1`,
      [ids.productId],
    )
    return {
      descuento: Number(fila!.cash_discount_percent),
      cuotas: Number(fila!.card_installments),
    }
  }

  it('la tienda arranca con 20 % y 3 cuotas', async () => {
    const fila = await pg.one<{ cash_discount_percent: string; card_installments: number }>(
      `select cash_discount_percent, card_installments from public.store_settings`,
    )
    expect(Number(fila!.cash_discount_percent)).toBe(20)
    expect(Number(fila!.card_installments)).toBe(3)
  })

  it('una pieza sin descuento propio usa el de la tienda', async () => {
    expect((await descuentoEnLaVista()).descuento).toBe(20)

    await pg.query(`update public.store_settings set cash_discount_percent = 15`)
    expect((await descuentoEnLaVista()).descuento).toBe(15)
  })

  it('el descuento propio de la pieza manda sobre el de la tienda', async () => {
    await pg.query(`update public.products set cash_discount_percent = 30 where id = $1`, [
      ids.productId,
    ])
    expect((await descuentoEnLaVista()).descuento).toBe(30)

    // Cambiar el general ya no la toca: tiene el suyo.
    await pg.query(`update public.store_settings set cash_discount_percent = 5`)
    expect((await descuentoEnLaVista()).descuento).toBe(30)
  })

  /** LA PRUEBA QUE IMPORTA: cero no es lo mismo que nulo. */
  it('cero en la pieza significa SIN descuento, no "usá el de la tienda"', async () => {
    await pg.query(`update public.products set cash_discount_percent = 0 where id = $1`, [
      ids.productId,
    ])
    await pg.query(`update public.store_settings set cash_discount_percent = 20`)

    expect((await descuentoEnLaVista()).descuento).toBe(0)
  })

  it('no admite un descuento del 100 % ni negativo', async () => {
    for (const malo of [100, 150, -1]) {
      await expect(
        pg.query(`update public.products set cash_discount_percent = $2 where id = $1`, [
          ids.productId,
          malo,
        ]),
      ).rejects.toThrow(/cash_discount_rango|violates check/i)
    }
  })

  it('no admite cuotas fuera de rango', async () => {
    for (const malo of [0, 25, -3]) {
      await expect(
        pg.query(`update public.store_settings set card_installments = $1`, [malo]),
      ).rejects.toThrow(/cuotas_rango|violates check/i)
    }
  })

  it('acepta decimales, que es lo que sale de escribir un precio', async () => {
    // 180.000 sobre 215.000 da 16,28 %. Si la columna fuese entera, el panel
    // no podría ofrecer "escribí el precio que querés cobrar".
    await pg.query(`update public.products set cash_discount_percent = 16.28 where id = $1`, [
      ids.productId,
    ])
    expect((await descuentoEnLaVista()).descuento).toBeCloseTo(16.28, 2)
  })

  /**
   * El descuento se resuelve en la vista para que ninguna pantalla repita la
   * regla. Si la columna desapareciera, la tienda mostraría un solo precio sin
   * que nada fallara: por eso se verifica que esté.
   */
  it('la vista entrega el descuento ya resuelto', async () => {
    const columnas = await pg.rows<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_name = 'v_catalog_products'`,
    )
    const nombres = columnas.map((c) => c.column_name)
    expect(nombres).toContain('cash_discount_percent')
    expect(nombres).toContain('card_installments')
  })

  /**
   * Con `cross join` en lugar de `left join`, el día que la fila de ajustes no
   * estuviera el catálogo entero devolvería cero piezas: la tienda vacía por un
   * dato de configuración.
   */
  it('sin la fila de ajustes la tienda sigue mostrando las piezas', async () => {
    await pg.query(`delete from public.store_settings`)

    const fila = await pg.one<{ n: string }>(
      `select count(*) as n from public.v_catalog_products where id = $1`,
      [ids.productId],
    )
    expect(Number(fila!.n)).toBe(1)
    expect((await descuentoEnLaVista()).descuento).toBe(0)
  })

  it('el precio de lista sigue siendo el de siempre: el descuento no lo toca', async () => {
    const antes = await pg.one<{ list_price: string; final_price: string }>(
      `select list_price, final_price from public.v_catalog_products where id = $1`,
      [ids.productId],
    )

    await pg.query(`update public.products set cash_discount_percent = 25 where id = $1`, [
      ids.productId,
    ])

    const despues = await pg.one<{ list_price: string; final_price: string }>(
      `select list_price, final_price from public.v_catalog_products where id = $1`,
      [ids.productId],
    )

    expect(despues!.list_price).toBe(antes!.list_price)
    expect(despues!.final_price).toBe(antes!.final_price)
  })
  /* ===========================================================================
     EL VIAJE: del carrito al pedido
     ======================================================================== */

  /**
   * El token va y vuelve junto con el carrito: `create_order` comprueba que
   * quien pide sea el dueño del carrito, y `anon_token` es único, así que cada
   * carrito de la prueba necesita el suyo.
   */
  async function carritoConPago(medio: string | null) {
    const token = `anon-pago-${crypto.randomUUID()}`
    const cart = await pg.one<{ id: string }>(
      `insert into public.carts (anon_token) values ($1) returning id`,
      [token],
    )
    await pg.query(
      `insert into public.cart_items (cart_id, variant_id, quantity, payment_method)
       values ($1, $2, 1, $3)`,
      [cart!.id, ids.variantId, medio],
    )
    return { cartId: cart!.id, token }
  }

  async function hacerPedido({ cartId, token }: { cartId: string; token: string }) {
    const r = await pg.one<{ create_order: { order_id: string } }>(
      `select public.create_order(
         $1::uuid, $2::text, 'Ana Perez', 'ana@example.com', '3511234567', $3::text
       ) as create_order`,
      [cartId, `key-${crypto.randomUUID()}`, token],
    )
    return r!.create_order.order_id
  }

  async function lineaDelPedido(orderId: string) {
    return pg.one<{ payment_method: string; cash_discount_percent: string }>(
      `select payment_method, cash_discount_percent
         from public.order_items where order_id = $1`,
      [orderId],
    )
  }

  it('el medio elegido llega al pedido', async () => {
    for (const medio of ['transferencia', 'efectivo', 'tarjeta']) {
      const orderId = await hacerPedido(await carritoConPago(medio))
      expect((await lineaDelPedido(orderId))!.payment_method).toBe(medio)
    }
  })

  it('sin elección, queda transferencia', async () => {
    const orderId = await hacerPedido(await carritoConPago(null))
    expect((await lineaDelPedido(orderId))!.payment_method).toBe('transferencia')
  })

  it('no acepta un medio de pago inventado', async () => {
    const cart = await pg.one<{ id: string }>(
      `insert into public.carts (anon_token) values ($1) returning id`,
      [`anon-malo-${crypto.randomUUID()}`],
    )
    await expect(
      pg.query(
        `insert into public.cart_items (cart_id, variant_id, quantity, payment_method)
         values ($1, $2, 1, 'cripto')`,
        [cart!.id, ids.variantId],
      ),
    ).rejects.toThrow(/payment_method_valido|violates check/i)
  })

  /**
   * LA PRUEBA QUE IMPORTA.
   *
   * Si el descuento se recalculara al leer el pedido, cambiar el general
   * movería lo que hay que cobrar en pedidos ya hechos: alguien que pidió con
   * el 20 % pasaría a deber el precio del 15 % sin que nadie lo decidiera.
   */
  it('el descuento del pedido queda congelado aunque después cambie', async () => {
    await pg.query(`update public.store_settings set cash_discount_percent = 20`)

    const orderId = await hacerPedido(await carritoConPago('transferencia'))
    expect(Number((await lineaDelPedido(orderId))!.cash_discount_percent)).toBe(20)

    await pg.query(`update public.store_settings set cash_discount_percent = 5`)
    await pg.query(`update public.products set cash_discount_percent = 1 where id = $1`, [
      ids.productId,
    ])

    expect(Number((await lineaDelPedido(orderId))!.cash_discount_percent)).toBe(20)
  })

  it('congela el de la pieza cuando la pieza tiene uno propio', async () => {
    await pg.query(`update public.products set cash_discount_percent = 33 where id = $1`, [
      ids.productId,
    ])
    const orderId = await hacerPedido(await carritoConPago('transferencia'))
    expect(Number((await lineaDelPedido(orderId))!.cash_discount_percent)).toBe(33)
  })

  it('create_order sigue sin recibir precios del navegador', async () => {
    // La función se reescribió entera en 0019. Esta garantía estructural -que
    // no haya ningún parámetro donde escribir un precio- tiene que seguir en
    // pie después de esa reescritura.
    const args = await pg.rows<{ parameter_name: string }>(
      `select parameter_name from information_schema.parameters
        where specific_schema = 'public'
          and exists (
            select 1 from information_schema.routines r
             where r.specific_name = parameters.specific_name
               and r.routine_name = 'create_order'
          )`,
    )
    const nombres = args.map((a) => a.parameter_name?.toLowerCase() ?? '')
    expect(nombres.some((n) => n.includes('price') || n.includes('total'))).toBe(false)
  })
})
