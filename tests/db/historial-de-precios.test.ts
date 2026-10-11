import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, seedBasics, type Db } from './harness'

/**
 * Cambiar un precio (migración 0026).
 *
 * ESTO ESTUVO ROTO DESDE QUE EXISTE EL HISTORIAL Y NADIE LO VIO.
 *
 * `price_history` es un registro de auditoría: a `authenticated` se le dio
 * `select` y nada más, porque nadie tiene que poder escribir a mano en un
 * historial. Pero el disparador que lo llena corría con los permisos de quien
 * edita, así que su INSERT fallaba y se llevaba puesto el UPDATE entero.
 *
 * El disparador salta `after update of base_price, sale_price`: por eso
 * fallaba EXACTAMENTE al tocar un precio y cualquier otro campo guardaba bien.
 * El síntoma que llegó fue "no me deja guardar precios".
 *
 * No se vio antes porque las pruebas que tocan precios corren como servicio, y
 * el servicio se saltea el control de permisos. Estas corren como
 * administradora, que es quien lo usa de verdad.
 */
describe('cambiar un precio siendo administradora', () => {
  let pg: Db
  let ids: Awaited<ReturnType<typeof seedBasics>>

  beforeEach(async () => {
    pg = await createTestDb()
    ids = await seedBasics(pg)
  })

  afterEach(async () => {
    await pg?.close()
  })

  /** LA PRUEBA QUE IMPORTA. Sin la 0026 esto tira "permission denied". */
  it('la administradora puede cambiar el precio de lista', async () => {
    await pg.asUser(ids.adminId)

    await expect(
      pg.query(`update public.products set base_price = 215000 where id = $1`, [
        ids.productId,
      ]),
    ).resolves.toBeDefined()

    await pg.asService()
    const fila = await pg.one<{ base_price: string }>(
      `select base_price from public.products where id = $1`,
      [ids.productId],
    )
    expect(Number(fila!.base_price)).toBe(215000)
  })

  it('y el cambio queda anotado en el historial', async () => {
    await pg.asUser(ids.adminId)
    await pg.query(`update public.products set base_price = 215000 where id = $1`, [
      ids.productId,
    ])

    await pg.asService()
    const h = await pg.one<{ field: string; old_price: string; new_price: string }>(
      `select field, old_price, new_price from public.price_history
        where product_id = $1 order by created_at desc limit 1`,
      [ids.productId],
    )

    expect(h!.field).toBe('base_price')
    expect(Number(h!.new_price)).toBe(215000)
  })

  it('también el precio promocional', async () => {
    await pg.asUser(ids.adminId)

    await expect(
      pg.query(
        `update public.products set base_price = 215000, sale_price = 180000 where id = $1`,
        [ids.productId],
      ),
    ).resolves.toBeDefined()
  })

  it('también el precio propio de una combinación', async () => {
    await pg.asUser(ids.adminId)

    await expect(
      pg.query(`update public.product_variants set price_override = 245000 where id = $1`, [
        ids.variantId,
      ]),
    ).resolves.toBeDefined()

    await pg.asService()
    const h = await pg.one<{ field: string }>(
      `select field from public.price_history where variant_id = $1`,
      [ids.variantId],
    )
    expect(h!.field).toBe('price_override')
  })

  /**
   * El historial sigue siendo de solo lectura. El disparador corre con
   * permisos del dueño justamente para que nadie más tenga que tenerlos: si
   * la administradora pudiera insertar filas a mano, el historial no serviría
   * como auditoría.
   */
  it('nadie puede escribir el historial a mano', async () => {
    await pg.asUser(ids.adminId)

    await expect(
      pg.query(
        `insert into public.price_history (product_id, field, old_price, new_price)
         values ($1, 'base_price', 1, 2)`,
        [ids.productId],
      ),
    ).rejects.toThrow(/permission denied|denegado/i)
  })

  it('guardar otros campos sigue andando', async () => {
    await pg.asUser(ids.adminId)
    await expect(
      pg.query(`update public.products set name = 'Respaldo Sol' where id = $1`, [
        ids.productId,
      ]),
    ).resolves.toBeDefined()
  })
})
