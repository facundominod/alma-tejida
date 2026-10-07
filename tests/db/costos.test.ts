import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, seedBasics, type Db } from './harness'

/**
 * Costo y margen (migración 0017).
 *
 * Lo que hay que demostrar acá no es que la cuenta dé bien —eso es una resta—
 * sino que el costo **no sale a la tienda**. Cuánto cuesta hacer una pieza es
 * información de adentro: si se filtra, cualquiera sabe exactamente cuánto
 * gana el negocio en cada venta, y eso no es de nadie más.
 */
describe('costos y margen', () => {
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

  it('el costo se guarda en la pieza y en la combinación', async () => {
    await pg.query(`update public.products set base_cost = 10000 where id = $1`, [
      ids.productId,
    ])
    await pg.query(`update public.product_variants set cost = 12000 where id = $1`, [
      ids.variantId,
    ])

    const fila = await pg.one<{ base_cost: string; cost: string }>(
      `select p.base_cost, v.cost
         from public.products p
         join public.product_variants v on v.id = $2
        where p.id = $1`,
      [ids.productId, ids.variantId],
    )

    expect(Number(fila!.base_cost)).toBe(10000)
    expect(Number(fila!.cost)).toBe(12000)
  })

  it('no admite costos negativos', async () => {
    await expect(
      pg.query(`update public.products set base_cost = -1 where id = $1`, [ids.productId]),
    ).rejects.toThrow(/base_cost_no_negativo|violates check/i)
  })

  /**
   * LA PRUEBA QUE IMPORTA.
   *
   * `v_catalog_products` es lo que alimenta el catálogo, la portada y la
   * búsqueda: todo lo que ve alguien sin iniciar sesión. Si el costo apareciera
   * ahí, viajaría en cada respuesta de la tienda.
   */
  it('el costo NO está en la vista que alimenta la tienda', async () => {
    const columnas = await pg.rows<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_name = 'v_catalog_products'`,
    )

    const nombres = columnas.map((c) => c.column_name)
    expect(nombres).not.toContain('base_cost')
    expect(nombres).not.toContain('cost')
    // Y sigue teniendo lo que si tiene que tener.
    expect(nombres).toContain('final_price')
  })

  it('un visitante no puede leer el costo de la tabla', async () => {
    await pg.asAnon()
    const filas = await pg.rows(`select * from public.products where id = $1`, [
      ids.productId,
    ])

    // RLS deja ver los productos publicados, asi que la fila llega; lo que no
    // puede pasar es que traiga el costo con un valor.
    for (const fila of filas) {
      expect(Object.hasOwn(fila, 'base_cost') ? fila.base_cost : null).toBeNull()
    }
  })

  it('nadie que no sea admin puede pedir los márgenes', async () => {
    const curiosa = await pg.createUser('curiosa@example.com')

    await pg.asUser(curiosa)
    await expect(pg.query(`select public.admin_margenes()`)).rejects.toThrow(/FORBIDDEN/i)

    await pg.asAnon()
    await expect(pg.query(`select public.admin_margenes()`)).rejects.toThrow(
      /FORBIDDEN|permission denied/i,
    )
  })

  it('el costo se congela al vender: cambiarlo después no mueve el margen de ayer', async () => {
    await pg.asService()
    await pg.query(`update public.product_variants set cost = 10000 where id = $1`, [
      ids.variantId,
    ])

    const pedido = await pg.one<{ id: string }>(
      `insert into public.orders
         (order_number, idempotency_key, customer_name, customer_email, customer_phone,
          status, subtotal, total)
       values ('AT-TEST-1', 'prueba-1', 'Prueba', 'prueba@example.com', '123',
               'paid', 40000, 40000)
       returning id`,
    )

    await pg.query(
      `insert into public.order_items
         (order_id, product_id, variant_id, product_name, product_slug,
          unit_price, quantity, line_total)
       values ($1, $2, $3, 'Pieza', 'pieza', 40000, 1, 40000)`,
      [pedido!.id, ids.productId, ids.variantId],
    )

    // La lana sube: el costo de hoy cambia.
    await pg.query(`update public.product_variants set cost = 25000 where id = $1`, [
      ids.variantId,
    ])

    const item = await pg.one<{ unit_cost: string }>(
      `select unit_cost from public.order_items where order_id = $1`,
      [pedido!.id],
    )

    // Pero el de esa venta sigue siendo el de ese dia. Un informe que cambia
    // solo no es un informe.
    expect(Number(item!.unit_cost)).toBe(10000)
  })
})
