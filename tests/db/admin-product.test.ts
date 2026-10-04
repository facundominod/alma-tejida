import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, seedBasics, type Db } from './harness'

/**
 * El editor de productos: caracteristicas dinamicas y variantes
 * (puntos 35-40, 102-105, 190).
 */
describe('estructura de producto', () => {
  let pg: Db
  let ids: Awaited<ReturnType<typeof seedBasics>>

  beforeEach(async () => {
    pg = await createTestDb()
    ids = await seedBasics(pg)
    await pg.asUser(ids.adminId)
  })

  afterEach(async () => {
    await pg?.close()
  })

  const save = (payload: unknown) =>
    pg.one<{ r: Record<string, number> }>(
      `select public.admin_save_product_structure($1::uuid, $2::jsonb) as r`,
      [ids.productId, JSON.stringify(payload)],
    )

  it('crea caracteristicas y genera las combinaciones elegidas', async () => {
    // El flujo del punto 103: "+ Agregar caracteristica" -> Color -> opciones
    await save({
      attributes: [
        {
          key: 'a-color',
          name: 'Color',
          type: 'color',
          values: [
            { key: 'v-crudo', value: 'Crudo', color_hex: '#EFE6DA' },
            { key: 'v-rosa', value: 'Rosa', color_hex: '#DCAE9B' },
          ],
        },
        {
          key: 'a-medida',
          name: 'Medida',
          type: 'measure',
          values: [
            { key: 'v-chica', value: '1,20 x 1,50' },
            { key: 'v-grande', value: '1,50 x 2,00' },
          ],
        },
      ],
      // El administrador elimino "Rosa / 1,50 x 2,00": no la fabrica (punto 104)
      variants: [
        { options: { 'a-color': 'v-crudo', 'a-medida': 'v-chica' }, sku: 'MR-CRU-S' },
        { options: { 'a-color': 'v-crudo', 'a-medida': 'v-grande' }, sku: 'MR-CRU-L', price_override: '52000' },
        { options: { 'a-color': 'v-rosa', 'a-medida': 'v-chica' }, sku: 'MR-ROS-S' },
      ],
    })

    await pg.asService()

    const variants = await pg.rows<{ variant_label: string; is_default: boolean }>(
      `select variant_label, is_default from public.v_product_variants
        where product_id = $1 and is_active order by position`,
      [ids.productId],
    )

    expect(variants).toHaveLength(3)
    expect(variants.map((v) => v.variant_label)).toEqual([
      'Crudo · 1,20 x 1,50',
      'Crudo · 1,50 x 2,00',
      'Rosa · 1,20 x 1,50',
    ])
    // Con caracteristicas, ninguna variante es "la de por defecto"
    expect(variants.every((v) => !v.is_default)).toBe(true)

    // La variante grande cuesta distinto (punto 45)
    const grande = await pg.one<{ final_price: string }>(
      `select final_price from public.v_product_variants
        where product_id = $1 and variant_label = 'Crudo · 1,50 x 2,00'`,
      [ids.productId],
    )
    expect(Number(grande!.final_price)).toBe(52000)
  })

  it('la busqueda encuentra el producto por el valor de un atributo', async () => {
    await save({
      attributes: [
        {
          key: 'a1',
          name: 'Tipo de lana',
          type: 'select',
          values: [{ key: 'v1', value: 'Merino' }],
        },
      ],
      variants: [{ options: { a1: 'v1' } }],
    })

    await pg.asAnon()
    const found = await pg.rows<{ name: string }>(
      `select name from public.search_products('merino')`,
    )
    expect(found.map((f) => f.name)).toContain('Manta Roma')
  })

  it('DESACTIVA en lugar de borrar una variante que ya tiene historia', async () => {
    await save({
      attributes: [
        {
          key: 'a1',
          name: 'Color',
          type: 'select',
          values: [
            { key: 'v1', value: 'Crudo' },
            { key: 'v2', value: 'Verde' },
          ],
        },
      ],
      variants: [{ options: { a1: 'v1' } }, { options: { a1: 'v2' } }],
    })

    await pg.asService()
    const verde = await pg.one<{ variant_id: string }>(
      `select variant_id from public.v_product_variants
        where product_id = $1 and variant_label = 'Verde'`,
      [ids.productId],
    )

    // Se le carga stock: ahora tiene historia
    await pg.asUser(ids.adminId)
    await pg.query(`select public.adjust_stock($1::uuid, 4, 'initial')`, [verde!.variant_id])

    // El administrador deja de fabricar el verde
    await save({
      attributes: [
        {
          key: 'a1',
          name: 'Color',
          type: 'select',
          values: [{ key: 'v1', value: 'Crudo' }],
        },
      ],
      variants: [{ options: { a1: 'v1' } }],
    })

    await pg.asService()
    const row = await pg.one<{ is_active: boolean; stock: number }>(
      `select is_active, stock from public.product_variants where id = $1`,
      [verde!.variant_id],
    )
    // Sigue existiendo (su movimiento de inventario es real), pero no se vende
    expect(row).toMatchObject({ is_active: false, stock: 4 })

    // Y no aparece mas en la tienda
    await pg.asAnon()
    const publicVariants = await pg.rows(
      `select variant_id from public.v_product_variants where product_id = $1`,
      [ids.productId],
    )
    expect(publicVariants.map((v) => (v as { variant_id: string }).variant_id)).not.toContain(
      verde!.variant_id,
    )
  })

  it('todo producto conserva al menos una variante, aunque se quiten todas', async () => {
    await save({ attributes: [], variants: [] })

    await pg.asService()
    const variants = await pg.rows<{ is_default: boolean }>(
      `select is_default from public.product_variants where product_id = $1`,
      [ids.productId],
    )
    expect(variants.length).toBeGreaterThanOrEqual(1)
    expect(variants.some((v) => v.is_default)).toBe(true)
  })

  it('un cliente NO puede guardar la estructura de un producto', async () => {
    const cliente = await pg.createUser('cliente2@example.com')
    await pg.asUser(cliente)

    await expect(
      pg.query(`select public.admin_save_product_structure($1::uuid, '{}'::jsonb)`, [
        ids.productId,
      ]),
    ).rejects.toThrow(/FORBIDDEN/)
  })

  it('deja constancia en la auditoria', async () => {
    await save({
      attributes: [
        { key: 'a1', name: 'Color', type: 'select', values: [{ key: 'v1', value: 'Crudo' }] },
      ],
      variants: [{ options: { a1: 'v1' } }],
    })

    await pg.asService()
    const entry = await pg.one<{ action: string; actor_id: string }>(
      `select action, actor_id from public.audit_log
        where entity_id = $1 order by created_at desc limit 1`,
      [ids.productId],
    )
    expect(entry).toMatchObject({ action: 'product.structure', actor_id: ids.adminId })
  })
})
