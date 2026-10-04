import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, seedBasics, type Db } from './harness'

type Variant = { stock: number; reserved: number }

/**
 * El nucleo del negocio: que nunca se venda dos veces la misma pieza y que el
 * inventario jamas quede en un numero que no se pueda explicar.
 * Puntos 39, 41, 58-63, 73, 74, 162, 163, 199, 200.
 */
describe('stock y pedidos', () => {
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

  // ---------------------------------------------------------------------------
  const variant = async (id = ids.variantId) =>
    (await pg.one<Variant>(
      `select stock, reserved from public.product_variants where id = $1`,
      [id],
    ))!

  const makeCart = async (
    items: Array<{ variantId: string; quantity: number }>,
    owner: { userId?: string; anonToken?: string },
  ) => {
    await pg.asService()
    const cart = await pg.one<{ id: string }>(
      `insert into public.carts (user_id, anon_token) values ($1, $2) returning id`,
      [owner.userId ?? null, owner.userId ? null : (owner.anonToken ?? 'anon-test')],
    )
    for (const item of items) {
      await pg.query(
        `insert into public.cart_items (cart_id, variant_id, quantity) values ($1, $2, $3)`,
        [cart!.id, item.variantId, item.quantity],
      )
    }
    return cart!.id
  }

  const createOrder = async (
    cartId: string,
    opts: { key?: string; anonToken?: string | null } = {},
  ) =>
    (await pg.one<{ create_order: Record<string, unknown> }>(
      `select public.create_order(
         $1::uuid, $2::text, 'Ana Perez', 'ana@example.com', '3511234567', $3::text
       ) as create_order`,
      [cartId, opts.key ?? `key-${Math.random()}`, opts.anonToken ?? 'anon-test'],
    ))!.create_order as {
      order_id: string
      order_number: string
      total: string
      duplicate: boolean
    }

  // ===========================================================================
  // MOVIMIENTOS
  // ===========================================================================
  it('el ingreso de mercaderia deja un movimiento con su saldo resultante', async () => {
    await pg.asUser(ids.adminId)
    await pg.query(`select public.adjust_stock($1::uuid, 5, 'restock', 'Ingreso')`, [
      ids.variantId,
    ])

    await pg.asService()
    expect(await variant()).toMatchObject({ stock: 8, reserved: 0 })

    const movements = await pg.rows<{
      movement_type: string
      stock_delta: number
      stock_after: number
    }>(
      `select movement_type, stock_delta, stock_after
         from public.inventory_movements
        where variant_id = $1 order by created_at`,
      [ids.variantId],
    )
    expect(movements).toEqual([
      expect.objectContaining({ movement_type: 'initial', stock_delta: 3, stock_after: 3 }),
      expect.objectContaining({ movement_type: 'restock', stock_delta: 5, stock_after: 8 }),
    ])
  })

  it('un cliente NO puede mover stock aunque llame a la funcion directamente', async () => {
    const customer = await pg.createUser('cliente@example.com')
    await pg.asUser(customer)

    await expect(
      pg.query(`select public.adjust_stock($1::uuid, 100, 'restock', 'hackeo')`, [
        ids.variantId,
      ]),
    ).rejects.toThrow(/FORBIDDEN/)

    await pg.asService()
    expect((await variant()).stock).toBe(3)
  })

  it('el stock nunca puede quedar negativo', async () => {
    await pg.asUser(ids.adminId)

    // Lo bloquean dos constraints a la vez (stock >= 0 y reserved <= stock).
    // Lo que importa no es cual salta primero, sino que la base lo rechaza y
    // el inventario queda exactamente como estaba.
    await expect(
      pg.query(`select public.adjust_stock($1::uuid, -10, 'adjustment', 'error')`, [
        ids.variantId,
      ]),
    ).rejects.toThrow(/violates check constraint/)

    await pg.asService()
    expect(await variant()).toMatchObject({ stock: 3, reserved: 0 })

    // y tampoco quedo un movimiento fantasma registrando algo que no paso
    const movements = await pg.rows(
      `select id from public.inventory_movements where variant_id = $1`,
      [ids.variantId],
    )
    expect(movements).toHaveLength(1) // solo el 'initial' del seed
  })

  // ===========================================================================
  // CREAR PEDIDO
  // ===========================================================================
  it('crear un pedido RESERVA stock pero NO toca el inventario fisico', async () => {
    const cart = await makeCart([{ variantId: ids.variantId, quantity: 1 }], {
      anonToken: 'anon-test',
    })
    const order = await createOrder(cart)

    expect(order.order_number).toMatch(/^AT-\d{5}$/)
    expect(Number(order.total)).toBe(40000)

    // stock fisico intacto; solo subio la reserva
    expect(await variant()).toMatchObject({ stock: 3, reserved: 1 })

    const movement = await pg.one<{ movement_type: string; reserved_delta: number }>(
      `select movement_type, reserved_delta from public.inventory_movements
        where order_id = $1`,
      [order.order_id],
    )
    expect(movement).toMatchObject({ movement_type: 'reserve', reserved_delta: 1 })
  })

  it('congela un snapshot del precio: cambiar el precio hoy no altera el pedido de ayer', async () => {
    const cart = await makeCart([{ variantId: ids.variantId, quantity: 2 }], {
      anonToken: 'anon-test',
    })
    const order = await createOrder(cart)

    await pg.query(`update public.products set base_price = 99000 where id = $1`, [
      ids.productId,
    ])

    const item = await pg.one<{
      unit_price: string
      line_total: string
      product_name: string
      quantity: number
    }>(`select * from public.order_items where order_id = $1`, [order.order_id])

    expect(Number(item!.unit_price)).toBe(40000)
    expect(Number(item!.line_total)).toBe(80000)
    expect(item!.product_name).toBe('Manta Roma')
  })

  it('ignora cualquier precio que venga del navegador: create_order no recibe precios', async () => {
    // La firma de create_order no tiene parametro de precio. Esta prueba fija
    // esa garantia estructural: no hay campo donde escribir una mentira.
    const args = await pg.rows<{ parameter_name: string }>(
      `select parameter_name from information_schema.parameters
        where specific_schema = 'public'
          and exists (
            select 1 from information_schema.routines r
             where r.specific_name = parameters.specific_name
               and r.routine_name = 'create_order'
          )`,
    )
    const names = args.map((a) => a.parameter_name ?? '')
    expect(names.some((n) => /price|precio|total|amount/i.test(n))).toBe(false)
  })

  it('EL DOBLE CLIC NO CREA DOS PEDIDOS (punto 163)', async () => {
    const cart = await makeCart([{ variantId: ids.variantId, quantity: 1 }], {
      anonToken: 'anon-test',
    })

    const first = await createOrder(cart, { key: 'misma-clave' })
    const second = await createOrder(cart, { key: 'misma-clave' })

    expect(second.order_id).toBe(first.order_id)
    expect(second.duplicate).toBe(true)

    const count = await pg.one<{ n: string }>(`select count(*) as n from public.orders`)
    expect(Number(count!.n)).toBe(1)

    // y sobre todo: reservo UNA sola vez
    expect(await variant()).toMatchObject({ stock: 3, reserved: 1 })
  })

  it('LA ULTIMA UNIDAD NO SE VENDE DOS VECES (puntos 73, 74)', async () => {
    await pg.asUser(ids.adminId)
    await pg.query(`select public.adjust_stock($1::uuid, -2, 'adjustment', 'queda 1')`, [
      ids.variantId,
    ])
    await pg.asService()
    expect((await variant()).stock).toBe(1)

    const cartA = await makeCart([{ variantId: ids.variantId, quantity: 1 }], {
      anonToken: 'ana',
    })
    const cartB = await makeCart([{ variantId: ids.variantId, quantity: 1 }], {
      anonToken: 'bruno',
    })

    await createOrder(cartA, { key: 'ana', anonToken: 'ana' })

    await expect(
      createOrder(cartB, { key: 'bruno', anonToken: 'bruno' }),
    ).rejects.toThrow(/OUT_OF_STOCK/)

    // el pedido de Bruno NO existe, y la reserva de Ana quedo intacta
    const orders = await pg.rows(`select id from public.orders`)
    expect(orders).toHaveLength(1)
    expect(await variant()).toMatchObject({ stock: 1, reserved: 1 })
  })

  it('un pedido que falla no deja stock reservado ni pedido a medias (atomicidad)', async () => {
    await pg.asService()
    const otro = await pg.one<{ id: string }>(
      `insert into public.products (name, slug, base_price, status)
       values ('Bufanda Nieve', 'bufanda-nieve', 15000, 'draft') returning id`,
    )
    const otroVariant = await pg.one<{ id: string }>(
      `select id from public.product_variants where product_id = $1`,
      [otro!.id],
    )

    // carrito con una pieza valida y una despublicada
    const cart = await makeCart(
      [
        { variantId: ids.variantId, quantity: 1 },
        { variantId: otroVariant!.id, quantity: 1 },
      ],
      { anonToken: 'anon-test' },
    )

    await expect(createOrder(cart)).rejects.toThrow(/PRODUCT_UNAVAILABLE/)

    // NADA quedo escrito: ni pedido, ni items, ni reserva
    expect(await pg.rows(`select id from public.orders`)).toHaveLength(0)
    expect(await pg.rows(`select id from public.order_items`)).toHaveLength(0)
    expect(await variant()).toMatchObject({ stock: 3, reserved: 0 })
  })

  it('rechaza un carrito vacio y un carrito ajeno', async () => {
    const empty = await makeCart([], { anonToken: 'anon-test' })
    await expect(createOrder(empty)).rejects.toThrow(/CART_EMPTY/)

    const cart = await makeCart([{ variantId: ids.variantId, quantity: 1 }], {
      anonToken: 'duenio-real',
    })
    await expect(createOrder(cart, { anonToken: 'otro-token' })).rejects.toThrow(/FORBIDDEN/)
  })

  // ===========================================================================
  // ESTADOS
  // ===========================================================================
  it('confirmar el pago es lo UNICO que baja el stock fisico', async () => {
    const cart = await makeCart([{ variantId: ids.variantId, quantity: 1 }], {
      anonToken: 'anon-test',
    })
    const order = await createOrder(cart)

    await pg.asUser(ids.adminId)
    await pg.query(`select public.set_order_status($1::uuid, 'paid', 'Transferencia ok')`, [
      order.order_id,
    ])

    await pg.asService()
    expect(await variant()).toMatchObject({ stock: 2, reserved: 0 })

    const row = await pg.one<{ paid_at: string; paid_by: string }>(
      `select paid_at, paid_by from public.orders where id = $1`,
      [order.order_id],
    )
    expect(row!.paid_at).not.toBeNull()
    expect(row!.paid_by).toBe(ids.adminId)

    const sale = await pg.one<{ movement_type: string; stock_delta: number }>(
      `select movement_type, stock_delta from public.inventory_movements
        where order_id = $1 and movement_type = 'sale'`,
      [order.order_id],
    )
    expect(sale).toMatchObject({ stock_delta: -1 })
  })

  it('cancelar antes de cobrar LIBERA la reserva sin tocar el inventario', async () => {
    const cart = await makeCart([{ variantId: ids.variantId, quantity: 2 }], {
      anonToken: 'anon-test',
    })
    const order = await createOrder(cart)
    expect(await variant()).toMatchObject({ stock: 3, reserved: 2 })

    await pg.asUser(ids.adminId)
    await pg.query(`select public.set_order_status($1::uuid, 'cancelled', 'No transfirio')`, [
      order.order_id,
    ])

    await pg.asService()
    expect(await variant()).toMatchObject({ stock: 3, reserved: 0 })

    const move = await pg.one<{ movement_type: string }>(
      `select movement_type from public.inventory_movements
        where order_id = $1 order by created_at desc limit 1`,
      [order.order_id],
    )
    expect(move!.movement_type).toBe('release')
  })

  it('cancelar DESPUES de cobrar devuelve la pieza al inventario', async () => {
    const cart = await makeCart([{ variantId: ids.variantId, quantity: 1 }], {
      anonToken: 'anon-test',
    })
    const order = await createOrder(cart)

    await pg.asUser(ids.adminId)
    await pg.query(`select public.set_order_status($1::uuid, 'paid')`, [order.order_id])
    await pg.asService()
    expect(await variant()).toMatchObject({ stock: 2, reserved: 0 })

    await pg.asUser(ids.adminId)
    await pg.query(`select public.set_order_status($1::uuid, 'cancelled', 'Devolucion')`, [
      order.order_id,
    ])

    await pg.asService()
    expect(await variant()).toMatchObject({ stock: 3, reserved: 0 })
  })

  it('no permite saltear estados ni descancelar un pedido', async () => {
    const cart = await makeCart([{ variantId: ids.variantId, quantity: 1 }], {
      anonToken: 'anon-test',
    })
    const order = await createOrder(cart)

    await pg.asUser(ids.adminId)
    await expect(
      pg.query(`select public.set_order_status($1::uuid, 'delivered')`, [order.order_id]),
    ).rejects.toThrow(/INVALID_TRANSITION/)

    await pg.query(`select public.set_order_status($1::uuid, 'cancelled')`, [order.order_id])
    await expect(
      pg.query(`select public.set_order_status($1::uuid, 'paid')`, [order.order_id]),
    ).rejects.toThrow(/INVALID_TRANSITION/)
  })

  it('deja el recorrido completo en el historial del pedido', async () => {
    const cart = await makeCart([{ variantId: ids.variantId, quantity: 1 }], {
      anonToken: 'anon-test',
    })
    const order = await createOrder(cart)

    await pg.asUser(ids.adminId)
    for (const status of ['contacted', 'awaiting_payment', 'paid', 'preparing', 'delivered']) {
      await pg.query(`select public.set_order_status($1::uuid, $2::public.order_status)`, [
        order.order_id,
        status,
      ])
    }

    await pg.asService()
    const history = await pg.rows<{ to_status: string }>(
      `select to_status from public.order_status_history
        where order_id = $1 order by created_at`,
      [order.order_id],
    )
    expect(history.map((h) => h.to_status)).toEqual([
      'pending',
      'contacted',
      'awaiting_payment',
      'paid',
      'preparing',
      'delivered',
    ])
  })

  // ===========================================================================
  // PIEZA UNICA Y A PEDIDO
  // ===========================================================================
  it('una PIEZA UNICA queda agotada al reservarse (punto 41)', async () => {
    await pg.asService()
    const unica = await pg.one<{ id: string }>(
      `insert into public.products (name, slug, base_price, status, availability_mode)
       values ('Tapiz Luna', 'tapiz-luna', 85000, 'published', 'unique_piece') returning id`,
    )
    const v = await pg.one<{ id: string }>(
      `select id from public.product_variants where product_id = $1`,
      [unica!.id],
    )
    await pg.asUser(ids.adminId)
    await pg.query(`select public.adjust_stock($1::uuid, 1, 'initial')`, [v!.id])
    await pg.asService()

    const cart = await makeCart([{ variantId: v!.id, quantity: 1 }], { anonToken: 'anon-test' })
    await createOrder(cart)

    const after = await pg.one<{ available_total: number }>(
      `select available_total from public.v_catalog_products where id = $1`,
      [unica!.id],
    )
    expect(after!.available_total).toBe(0)
  })

  it('un producto A PEDIDO se vende sin stock y no reserva nada (punto 42)', async () => {
    await pg.asService()
    const encargo = await pg.one<{ id: string }>(
      `insert into public.products
         (name, slug, base_price, status, availability_mode, lead_time_days)
       values ('Manta Nordica', 'manta-nordica', 120000, 'published', 'made_to_order', 15)
       returning id`,
    )
    const v = await pg.one<{ id: string }>(
      `select id from public.product_variants where product_id = $1`,
      [encargo!.id],
    )

    const cart = await makeCart([{ variantId: v!.id, quantity: 1 }], { anonToken: 'anon-test' })
    const order = await createOrder(cart)

    expect(Number(order.total)).toBe(120000)
    expect(await variant(v!.id)).toMatchObject({ stock: 0, reserved: 0 })

    const item = await pg.one<{ reserved_quantity: number; quantity: number }>(
      `select reserved_quantity, quantity from public.order_items where order_id = $1`,
      [order.order_id],
    )
    expect(item).toMatchObject({ quantity: 1, reserved_quantity: 0 })
  })

  // ===========================================================================
  // INVITADO
  // ===========================================================================
  it('el invitado consulta SU pedido con el token, y ningun otro', async () => {
    const cart = await makeCart([{ variantId: ids.variantId, quantity: 1 }], {
      anonToken: 'anon-test',
    })
    const order = await createOrder(cart)

    const row = await pg.one<{ order_number: string; access_token: string }>(
      `select order_number, access_token from public.orders where id = $1`,
      [order.order_id],
    )

    await pg.asAnon()
    const ok = await pg.one<{ get_order_public: Record<string, unknown> }>(
      `select public.get_order_public($1, $2::uuid) as get_order_public`,
      [row!.order_number, row!.access_token],
    )
    expect(ok!.get_order_public).toMatchObject({ order_number: row!.order_number })

    // token equivocado: mismo resultado que "no existe"
    const bad = await pg.one<{ get_order_public: unknown }>(
      `select public.get_order_public($1, '00000000-0000-0000-0000-000000000000'::uuid)
         as get_order_public`,
      [row!.order_number],
    )
    expect(bad!.get_order_public).toBeNull()
  })

  it('avisa al administrador UNA sola vez por pedido nuevo (punto 99)', async () => {
    const cart = await makeCart(
      [{ variantId: ids.variantId, quantity: 2 }],
      { anonToken: 'anon-test' },
    )
    const order = await createOrder(cart)

    const notifications = await pg.rows<{ type: string; title: string }>(
      `select type, title from public.notifications
        where audience = 'admin' and entity_id = $1`,
      [order.order_id],
    )
    expect(notifications).toHaveLength(1)
    expect(notifications[0].type).toBe('order_created')
  })
})
