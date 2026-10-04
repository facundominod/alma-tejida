import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, seedBasics, type Db } from './harness'

/**
 * Las pruebas que deben FALLAR si alguien afloja una policy.
 * Puntos 10, 12, 156-158, 197, 201, 202.
 *
 * Todas corren con `set role authenticated` / `set role anon`, es decir con
 * exactamente los mismos permisos que tiene el navegador. Si algo pasa aca,
 * pasa en produccion.
 */
describe('row level security', () => {
  let pg: Db
  let ids: Awaited<ReturnType<typeof seedBasics>>
  let ana: string
  let bruno: string

  beforeEach(async () => {
    pg = await createTestDb()
    ids = await seedBasics(pg)
    ana = await pg.createUser('ana@example.com')
    bruno = await pg.createUser('bruno@example.com')
    await pg.asService()
  })

  afterEach(async () => {
    await pg?.close()
  })

  /** Crea un pedido pagado para `userId`. Devuelve su id. */
  async function orderFor(userId: string) {
    await pg.asService()
    const cart = await pg.one<{ id: string }>(
      `insert into public.carts (user_id) values ($1) returning id`,
      [userId],
    )
    await pg.query(
      `insert into public.cart_items (cart_id, variant_id, quantity) values ($1, $2, 1)`,
      [cart!.id, ids.variantId],
    )

    await pg.asUser(userId)
    const created = await pg.one<{ r: { order_id: string } }>(
      `select public.create_order($1::uuid, $2::text, 'Cliente', $3::text, '3511234567')
         as r`,
      [cart!.id, `k-${userId}-${Math.random()}`, `${userId}@example.com`],
    )
    const orderId = created!.r.order_id

    await pg.asUser(ids.adminId)
    await pg.query(`select public.set_order_status($1::uuid, 'paid')`, [orderId])
    await pg.asService()
    return orderId
  }

  // ===========================================================================
  // AISLAMIENTO ENTRE CLIENTES
  // ===========================================================================
  it('el cliente A NO puede ver el pedido del cliente B (punto 201)', async () => {
    const pedidoDeAna = await orderFor(ana)

    await pg.asUser(bruno)
    const visible = await pg.rows(`select id from public.orders where id = $1`, [pedidoDeAna])
    expect(visible).toHaveLength(0)

    // tampoco listando todo
    const todos = await pg.rows(`select id from public.orders`)
    expect(todos).toHaveLength(0)
  })

  it('el cliente A NO puede ver los items ni el historial del pedido de B', async () => {
    const pedidoDeAna = await orderFor(ana)

    await pg.asUser(bruno)
    expect(
      await pg.rows(`select id from public.order_items where order_id = $1`, [pedidoDeAna]),
    ).toHaveLength(0)
    expect(
      await pg.rows(`select id from public.order_status_history where order_id = $1`, [
        pedidoDeAna,
      ]),
    ).toHaveLength(0)
  })

  it('el cliente A NO puede ver el comprobante de B', async () => {
    const pedidoDeAna = await orderFor(ana)

    await pg.asService()
    await pg.query(
      `insert into public.payment_proofs (order_id, storage_path, uploaded_by, file_size)
       values ($1::uuid, 'orders/' || $1::text || '/comprobante.jpg', $2::uuid, 1024)`,
      [pedidoDeAna, ana],
    )

    await pg.asUser(bruno)
    expect(await pg.rows(`select id from public.payment_proofs`)).toHaveLength(0)

    await pg.asUser(ana)
    expect(await pg.rows(`select id from public.payment_proofs`)).toHaveLength(1)
  })

  it('el cliente A NO puede ver el perfil de B', async () => {
    await pg.asUser(ana)
    const perfiles = await pg.rows<{ id: string }>(`select id from public.profiles`)
    expect(perfiles.map((p) => p.id)).toEqual([ana])
  })

  it('el cliente A NO puede subir un comprobante al pedido de B', async () => {
    const pedidoDeAna = await orderFor(ana)

    await pg.asUser(bruno)
    await expect(
      pg.query(
        `insert into public.payment_proofs (order_id, storage_path, uploaded_by)
         values ($1, 'orders/x/falso.jpg', $2)`,
        [pedidoDeAna, bruno],
      ),
    ).rejects.toThrow(/row-level security/)
  })

  // ===========================================================================
  // ESCALADA DE PRIVILEGIOS
  // ===========================================================================
  it('un cliente NO puede convertirse en administrador (puntos 156, 157)', async () => {
    await pg.asUser(ana)
    await expect(
      pg.query(`update public.profiles set role = 'admin' where id = $1`, [ana]),
    ).rejects.toThrow(/row-level security/)

    await pg.asService()
    const perfil = await pg.one<{ role: string }>(
      `select role from public.profiles where id = $1`,
      [ana],
    )
    expect(perfil!.role).toBe('customer')
  })

  it('registrarse NUNCA otorga el rol admin', async () => {
    const nuevo = await pg.createUser('random@example.com')
    await pg.asService()
    const perfil = await pg.one<{ role: string }>(
      `select role from public.profiles where id = $1`,
      [nuevo],
    )
    expect(perfil!.role).toBe('customer')
  })

  it('un cliente NO puede ejecutar acciones administrativas (punto 202)', async () => {
    const pedidoDeAna = await orderFor(ana)

    await pg.asUser(ana)

    await expect(
      pg.query(`select public.set_order_status($1::uuid, 'delivered')`, [pedidoDeAna]),
    ).rejects.toThrow(/FORBIDDEN/)

    await expect(
      pg.query(`select public.adjust_stock($1::uuid, 50, 'restock')`, [ids.variantId]),
    ).rejects.toThrow(/FORBIDDEN/)

    await expect(pg.query(`select public.admin_dashboard()`)).rejects.toThrow(/FORBIDDEN/)
    await expect(pg.query(`select public.storage_usage()`)).rejects.toThrow(/FORBIDDEN/)
  })

  it('un cliente NO puede escribir productos, precios ni promociones', async () => {
    await pg.asUser(ana)

    // Un UPDATE filtrado por RLS no lanza error: simplemente NO ENCUENTRA la
    // fila y afecta 0 registros. La garantia no es que explote, es que el dato
    // no cambia. Eso es exactamente lo que se verifica aca.
    const attempt = await pg.query(
      `update public.products set base_price = 1 where id = $1`,
      [ids.productId],
    )
    expect(attempt.affectedRows).toBe(0)

    await pg.asService()
    const precio = await pg.one<{ base_price: string }>(
      `select base_price from public.products where id = $1`,
      [ids.productId],
    )
    expect(Number(precio!.base_price)).toBe(40000)
    await pg.asUser(ana)

    await expect(
      pg.query(
        `insert into public.products (name, slug, base_price) values ('Pirata','pirata',1)`,
      ),
    ).rejects.toThrow(/row-level security|permission denied/)

    await expect(
      pg.query(
        `insert into public.promotions (title, discount_type, discount_value)
         values ('90 off','percent',90)`,
      ),
    ).rejects.toThrow(/row-level security|permission denied/)
  })

  it('un cliente NO puede tocar el inventario ni por la puerta de atras', async () => {
    await pg.asUser(ana)

    const attempt = await pg.query(
      `update public.product_variants set stock = 999 where id = $1`,
      [ids.variantId],
    )
    expect(attempt.affectedRows).toBe(0)

    await pg.asService()
    const v = await pg.one<{ stock: number }>(
      `select stock from public.product_variants where id = $1`,
      [ids.variantId],
    )
    expect(v!.stock).toBe(3)
    await pg.asUser(ana)

    await expect(
      pg.query(
        `insert into public.inventory_movements
           (variant_id, movement_type, stock_delta, stock_after, reserved_after)
         values ($1, 'restock', 999, 999, 0)`,
        [ids.variantId],
      ),
    ).rejects.toThrow(/permission denied|row-level security/)
  })

  it('un cliente NO puede leer datos comerciales internos', async () => {
    await pg.asUser(ana)

    expect(await pg.rows(`select id from public.price_history`)).toHaveLength(0)
    expect(await pg.rows(`select id from public.audit_log`)).toHaveLength(0)
    expect(await pg.rows(`select id from public.inventory_movements`)).toHaveLength(0)
    await expect(pg.query(`select * from public.analytics_events limit 1`)).rejects.toThrow(
      /permission denied/,
    )
  })

  it('un cliente NO puede leer el carrito de otro', async () => {
    await pg.asService()
    const cart = await pg.one<{ id: string }>(
      `insert into public.carts (user_id) values ($1) returning id`,
      [ana],
    )
    await pg.query(
      `insert into public.cart_items (cart_id, variant_id, quantity) values ($1, $2, 1)`,
      [cart!.id, ids.variantId],
    )

    await pg.asUser(bruno)
    expect(await pg.rows(`select id from public.carts`)).toHaveLength(0)
    expect(await pg.rows(`select id from public.cart_items`)).toHaveLength(0)
  })

  // ===========================================================================
  // CATALOGO PUBLICO
  // ===========================================================================
  it('el visitante ve SOLO lo publicado', async () => {
    await pg.asService()
    await pg.query(
      `insert into public.products (name, slug, base_price, status)
       values ('Borrador Secreto', 'borrador-secreto', 1000, 'draft')`,
    )
    await pg.query(
      `insert into public.products (name, slug, base_price, status)
       values ('Archivado', 'archivado', 1000, 'archived')`,
    )

    await pg.asAnon()
    const visibles = await pg.rows<{ name: string }>(`select name from public.products`)
    expect(visibles.map((v) => v.name)).toEqual(['Manta Roma'])
  })

  it('el visitante NO ve categorias ocultas ni promociones fuera de vigencia', async () => {
    await pg.asService()
    await pg.query(
      `insert into public.categories (name, slug, is_visible) values ('Oculta','oculta',false)`,
    )
    await pg.query(
      `insert into public.promotions (title, discount_type, discount_value, ends_at)
       values ('Vencida','percent',50, now() - interval '1 day')`,
    )
    await pg.query(
      `insert into public.promotions (title, discount_type, discount_value, starts_at)
       values ('Futura','percent',50, now() + interval '5 days')`,
    )
    await pg.query(
      `insert into public.promotions (title, discount_type, discount_value)
       values ('Vigente','percent',10)`,
    )

    await pg.asAnon()
    expect(
      (await pg.rows<{ name: string }>(`select name from public.categories`)).map((c) => c.name),
    ).toEqual(['Mantas'])
    expect(
      (await pg.rows<{ title: string }>(`select title from public.promotions`)).map(
        (p) => p.title,
      ),
    ).toEqual(['Vigente'])
  })

  // ===========================================================================
  // MODERACION
  // ===========================================================================
  it('una pregunta nace privada y solo se ve si el administrador la publica', async () => {
    await pg.asUser(ana)
    await pg.query(
      `insert into public.questions (product_id, user_id, body)
       values ($1, $2, 'Lo hacen en azul?')`,
      [ids.productId, ana],
    )

    // Bruno no la ve
    await pg.asUser(bruno)
    expect(await pg.rows(`select id from public.questions`)).toHaveLength(0)

    // Ana ve la suya
    await pg.asUser(ana)
    expect(await pg.rows(`select id from public.questions`)).toHaveLength(1)

    // el admin responde y publica
    await pg.asUser(ids.adminId)
    await pg.query(
      `update public.questions
          set answer = 'Si, por encargo', answered_at = now(), status = 'published'`,
    )

    await pg.asAnon()
    expect(await pg.rows(`select id from public.questions`)).toHaveLength(1)
  })

  it('una pregunta NO puede nacer publicada ni autorresponderse', async () => {
    await pg.asUser(ana)
    await expect(
      pg.query(
        `insert into public.questions (product_id, user_id, body, status, answer)
         values ($1, $2, 'Truco', 'published', 'Me respondo solo')`,
        [ids.productId, ana],
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it('NO se puede resenar un producto que no se compro (punto 80)', async () => {
    await pg.asUser(ana)
    const pedidoAjeno = await (async () => {
      await pg.asService()
      return orderFor(bruno)
    })()

    await pg.asUser(ana)
    await expect(
      pg.query(
        `insert into public.reviews (product_id, order_id, user_id, rating, body)
         values ($1, $2, $3, 5, 'Divina')`,
        [ids.productId, pedidoAjeno, ana],
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it('SI se puede resenar lo que si se compro, y nace pendiente de moderacion', async () => {
    const pedidoDeAna = await orderFor(ana)

    await pg.asUser(ana)
    await pg.query(
      `insert into public.reviews (product_id, order_id, user_id, rating, body)
       values ($1, $2, $3, 5, 'Hermosa, muy abrigada')`,
      [ids.productId, pedidoDeAna, ana],
    )

    await pg.asService()
    const review = await pg.one<{ status: string }>(`select status from public.reviews`)
    expect(review!.status).toBe('pending')

    // todavia invisible para el publico
    await pg.asAnon()
    expect(await pg.rows(`select id from public.reviews`)).toHaveLength(0)

    // y el rating del producto sigue sin moverse
    await pg.asService()
    const producto = await pg.one<{ rating_count: number }>(
      `select rating_count from public.products where id = $1`,
      [ids.productId],
    )
    expect(producto!.rating_count).toBe(0)
  })

  it('una resena NO puede nacer aprobada', async () => {
    const pedidoDeAna = await orderFor(ana)
    await pg.asUser(ana)
    await expect(
      pg.query(
        `insert into public.reviews (product_id, order_id, user_id, rating, status)
         values ($1, $2, $3, 5, 'approved')`,
        [ids.productId, pedidoDeAna, ana],
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it('al aprobarla, el rating agregado del producto se actualiza (punto 83)', async () => {
    const pedidoDeAna = await orderFor(ana)
    const pedidoDeBruno = await orderFor(bruno)

    await pg.asUser(ana)
    await pg.query(
      `insert into public.reviews (product_id, order_id, user_id, rating)
       values ($1, $2, $3, 5)`,
      [ids.productId, pedidoDeAna, ana],
    )
    await pg.asUser(bruno)
    await pg.query(
      `insert into public.reviews (product_id, order_id, user_id, rating)
       values ($1, $2, $3, 4)`,
      [ids.productId, pedidoDeBruno, bruno],
    )

    await pg.asUser(ids.adminId)
    await pg.query(`update public.reviews set status = 'approved'`)

    await pg.asService()
    const producto = await pg.one<{ rating_avg: string; rating_count: number }>(
      `select rating_avg, rating_count from public.products where id = $1`,
      [ids.productId],
    )
    expect(producto!.rating_count).toBe(2)
    expect(Number(producto!.rating_avg)).toBe(4.5)
  })

  it('ocultar una resena EXIGE justificarlo (punto 82)', async () => {
    const pedidoDeAna = await orderFor(ana)
    await pg.asUser(ana)
    await pg.query(
      `insert into public.reviews (product_id, order_id, user_id, rating, body)
       values ($1, $2, $3, 1, 'No me gusto')`,
      [ids.productId, pedidoDeAna, ana],
    )

    await pg.asUser(ids.adminId)
    await expect(
      pg.query(`update public.reviews set status = 'hidden'`),
    ).rejects.toThrow(/reviews_hidden_needs_reason/)

    await pg.query(
      `update public.reviews set status = 'hidden', hidden_reason = 'Lenguaje ofensivo'`,
    )
  })

  // ===========================================================================
  // NOTIFICACIONES
  // ===========================================================================
  it('cada quien ve solo sus notificaciones', async () => {
    await orderFor(ana)

    await pg.asUser(bruno)
    expect(await pg.rows(`select id from public.notifications`)).toHaveLength(0)

    await pg.asUser(ids.adminId)
    const delAdmin = await pg.rows<{ audience: string }>(
      `select audience from public.notifications`,
    )
    expect(delAdmin.length).toBeGreaterThan(0)
    expect(delAdmin.every((n) => n.audience === 'admin')).toBe(true)

    await pg.asUser(ana)
    const deAna = await pg.rows<{ audience: string }>(
      `select audience from public.notifications`,
    )
    expect(deAna.every((n) => n.audience === 'customer')).toBe(true)
  })
})
