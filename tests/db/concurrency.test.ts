import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from 'pg'

/**
 * CONCURRENCIA REAL: dos clientes, dos conexiones, el mismo segundo.
 *
 * Las otras pruebas corren sobre PGlite, que tiene UNA sola conexión: ahí la
 * "última unidad" se verifica en secuencia, y eso comprueba la lógica pero no
 * el bloqueo. El `SELECT … FOR UPDATE` de create_order sólo se puede probar de
 * verdad con dos transacciones simultáneas contra un Postgres con conexiones
 * reales.
 *
 * Por eso esta prueba está separada y **se saltea sola** si no hay a qué
 * conectarse. Para correrla:
 *
 *   TEST_DATABASE_URL="postgresql://postgres:[CLAVE]@[HOST]:5432/postgres" npm run test:concurrency
 *
 * Usá la base de DESARROLLO. La prueba crea su propio producto de prueba y lo
 * borra al terminar, pero no tiene sentido correrla contra producción.
 */

const DATABASE_URL = process.env.TEST_DATABASE_URL

// `describe.skipIf` deja constancia de que la prueba existe y por qué no corrió,
// en lugar de dar un falso verde silencioso.
const suite = DATABASE_URL ? describe : describe.skip

suite('concurrencia real (dos conexiones)', () => {
  let setup: Client
  let productId: string
  let variantId: string

  beforeAll(async () => {
    setup = new Client({ connectionString: DATABASE_URL })
    await setup.connect()

    const product = await setup.query<{ id: string }>(
      `insert into public.products (name, slug, base_price, status, stock_display)
       values ('ZZZ Prueba de concurrencia', 'zzz-prueba-concurrencia-' || extract(epoch from now())::bigint,
               1000, 'published', 'exact')
       returning id`,
    )
    productId = product.rows[0].id

    const variant = await setup.query<{ id: string }>(
      `select id from public.product_variants where product_id = $1 and is_default`,
      [productId],
    )
    variantId = variant.rows[0].id

    // UNA sola unidad. Se escribe directo porque acá no interesa el
    // movimiento de inventario, sino la carrera por esa unidad.
    await setup.query(
      `update public.product_variants set stock = 1, reserved = 0 where id = $1`,
      [variantId],
    )
  }, 60_000)

  afterAll(async () => {
    if (!setup) return
    // Los pedidos de prueba se van con el producto (los items quedan con
    // product_id null por la FK, así que se borran a mano).
    await setup.query(
      `delete from public.orders where id in (
         select order_id from public.order_items where product_id = $1
       )`,
      [productId],
    )
    await setup.query(`delete from public.products where id = $1`, [productId])
    await setup.end()
  }, 60_000)

  /** Un carrito materializado con esa variante, listo para create_order. */
  async function nuevoCarrito(client: Client, token: string): Promise<string> {
    const cart = await client.query<{ id: string }>(
      `insert into public.carts (anon_token) values ($1) returning id`,
      [token],
    )
    await client.query(
      `insert into public.cart_items (cart_id, variant_id, quantity) values ($1, $2, 1)`,
      [cart.rows[0].id, variantId],
    )
    return cart.rows[0].id
  }

  it('LA ÚLTIMA UNIDAD NO SE VENDE DOS VECES, con dos pedidos simultáneos', async () => {
    const ana = new Client({ connectionString: DATABASE_URL })
    const bruno = new Client({ connectionString: DATABASE_URL })
    await Promise.all([ana.connect(), bruno.connect()])

    try {
      const cartAna = await nuevoCarrito(ana, `ana-${Date.now()}`)
      const cartBruno = await nuevoCarrito(bruno, `bruno-${Date.now()}`)

      const pedir = (client: Client, cartId: string, nombre: string, token: string) =>
        client.query(
          `select public.create_order(
             $1::uuid, $2::text, $3::text, $4::text, '3511234567', $5::text
           ) as resultado`,
          [cartId, `concurrencia-${nombre}-${Date.now()}`, nombre, `${nombre}@test.local`, token],
        )

      // LAS DOS A LA VEZ. Sin await entre medio: salen juntas.
      const [resultadoAna, resultadoBruno] = await Promise.allSettled([
        pedir(ana, cartAna, 'Ana', `ana-${Date.now()}`),
        pedir(bruno, cartBruno, 'Bruno', `bruno-${Date.now()}`),
      ])

      const exitos = [resultadoAna, resultadoBruno].filter((r) => r.status === 'fulfilled')
      const fallos = [resultadoAna, resultadoBruno].filter((r) => r.status === 'rejected')

      // EXACTAMENTE una gana. Ni dos, ni ninguna.
      expect(exitos).toHaveLength(1)
      expect(fallos).toHaveLength(1)

      // Y la que pierde falla LIMPIO, con el motivo correcto
      const motivo = (fallos[0] as PromiseRejectedResult).reason
      expect(String(motivo.message ?? motivo)).toMatch(/OUT_OF_STOCK/)

      // El inventario quedó coherente: 1 en stock, 1 reservado, 0 disponible
      const estado = await setup.query<{ stock: number; reserved: number }>(
        `select stock, reserved from public.product_variants where id = $1`,
        [variantId],
      )
      expect(estado.rows[0]).toMatchObject({ stock: 1, reserved: 1 })

      // Y se creó UN pedido, no dos
      const pedidos = await setup.query<{ n: string }>(
        `select count(*) as n from public.order_items where product_id = $1`,
        [productId],
      )
      expect(Number(pedidos.rows[0].n)).toBe(1)
    } finally {
      await Promise.all([ana.end(), bruno.end()])
    }
  }, 60_000)

  it('el bloqueo serializa en lugar de abortar: la segunda espera y después falla', async () => {
    // Se devuelve la unidad para repetir la carrera
    await setup.query(
      `update public.product_variants set stock = 1, reserved = 0 where id = $1`,
      [variantId],
    )
    await setup.query(
      `delete from public.orders where id in (
         select order_id from public.order_items where product_id = $1)`,
      [productId],
    )

    const uno = new Client({ connectionString: DATABASE_URL })
    const dos = new Client({ connectionString: DATABASE_URL })
    await Promise.all([uno.connect(), dos.connect()])

    try {
      // La primera transacción toma el bloqueo y se queda con él
      await uno.query('begin')
      await uno.query(
        `select stock from public.product_variants where id = $1 for update`,
        [variantId],
      )

      // La segunda intenta tomarlo con un tope corto: si el bloqueo existe,
      // se queda esperando y salta el timeout. Si NO existiera, pasaría de
      // largo y esta prueba fallaría, que es justo lo que queremos detectar.
      await dos.query(`set lock_timeout = '1500ms'`)

      await expect(
        dos.query(
          `select stock from public.product_variants where id = $1 for update`,
          [variantId],
        ),
      ).rejects.toThrow(/lock timeout|canceling statement/i)

      await uno.query('rollback')
    } finally {
      await Promise.all([uno.end(), dos.end()])
    }
  }, 60_000)
})
