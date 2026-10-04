import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, seedBasics, type Db } from './harness'

type Price = {
  list_price: string
  final_price: string
  discount_amount: string
  discount_percent: number
  promotion_id: string | null
  promotion_title: string | null
  price_source: string
}

/**
 * El precio se calcula en UN solo lugar (punto 107). Estas pruebas fijan las
 * reglas de prioridad para que nadie las cambie sin darse cuenta.
 */
describe('precio efectivo', () => {
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

  const price = async (variantId?: string) =>
    (await pg.one<Price>(`select * from public.effective_price($1, $2)`, [
      ids.productId,
      variantId ?? ids.variantId,
    ]))!

  it('sin promociones devuelve el precio base', async () => {
    const p = await price()
    expect(Number(p.list_price)).toBe(40000)
    expect(Number(p.final_price)).toBe(40000)
    expect(Number(p.discount_amount)).toBe(0)
    expect(p.price_source).toBe('base')
  })

  it('el override de la variante manda sobre el precio base (punto 45)', async () => {
    await pg.query(
      `update public.product_variants set price_override = 52000 where id = $1`,
      [ids.variantId],
    )
    const p = await price()
    expect(Number(p.list_price)).toBe(52000)
    expect(Number(p.final_price)).toBe(52000)
  })

  it('aplica el precio promocional del producto si esta vigente', async () => {
    await pg.query(
      `update public.products
          set sale_price = 32000,
              sale_starts_at = now() - interval '1 day',
              sale_ends_at   = now() + interval '1 day'
        where id = $1`,
      [ids.productId],
    )
    const p = await price()
    expect(Number(p.final_price)).toBe(32000)
    expect(Number(p.discount_amount)).toBe(8000)
    expect(p.discount_percent).toBe(20)
    expect(p.price_source).toBe('product_sale')
  })

  it('IGNORA una oferta cuya vigencia ya paso', async () => {
    await pg.query(
      `update public.products
          set sale_price = 32000,
              sale_starts_at = now() - interval '10 days',
              sale_ends_at   = now() - interval '1 day'
        where id = $1`,
      [ids.productId],
    )
    const p = await price()
    expect(Number(p.final_price)).toBe(40000)
    expect(p.price_source).toBe('base')
  })

  it('IGNORA una oferta que todavia no empezo', async () => {
    await pg.query(
      `update public.products
          set sale_price = 32000, sale_starts_at = now() + interval '2 days'
        where id = $1`,
      [ids.productId],
    )
    expect(Number((await price()).final_price)).toBe(40000)
  })

  it('aplica una promocion por categoria', async () => {
    const promo = await pg.one<{ id: string }>(
      `insert into public.promotions (title, discount_type, discount_value)
       values ('20% en mantas', 'percent', 20) returning id`,
    )
    await pg.query(
      `insert into public.promotion_targets (promotion_id, category_id) values ($1, $2)`,
      [promo!.id, ids.categoryId],
    )

    const p = await price()
    expect(Number(p.final_price)).toBe(32000)
    expect(p.price_source).toBe('promotion')
    expect(p.promotion_title).toBe('20% en mantas')
  })

  it('entre varias promociones vigentes gana la MEJOR para el cliente, y nunca se acumulan', async () => {
    for (const [title, value] of [
      ['10% off', 10],
      ['30% off', 30],
      ['15% off', 15],
    ] as const) {
      const promo = await pg.one<{ id: string }>(
        `insert into public.promotions (title, discount_type, discount_value)
         values ($1, 'percent', $2) returning id`,
        [title, value],
      )
      await pg.query(
        `insert into public.promotion_targets (promotion_id, product_id) values ($1, $2)`,
        [promo!.id, ids.productId],
      )
    }

    const p = await price()
    // 30% del mejor descuento, NO 10+30+15 acumulado
    expect(Number(p.final_price)).toBe(28000)
    expect(p.promotion_title).toBe('30% off')
  })

  it('soporta promocion de precio fijo y de monto fijo', async () => {
    const fixed = await pg.one<{ id: string }>(
      `insert into public.promotions (title, discount_type, discount_value)
       values ('Precio especial', 'fixed_price', 25000) returning id`,
    )
    await pg.query(
      `insert into public.promotion_targets (promotion_id, product_id) values ($1, $2)`,
      [fixed!.id, ids.productId],
    )
    expect(Number((await price()).final_price)).toBe(25000)

    await pg.query(`update public.promotions set is_active = false where id = $1`, [fixed!.id])

    const amount = await pg.one<{ id: string }>(
      `insert into public.promotions (title, discount_type, discount_value)
       values ('$5000 menos', 'amount_off', 5000) returning id`,
    )
    await pg.query(
      `insert into public.promotion_targets (promotion_id, product_id) values ($1, $2)`,
      [amount!.id, ids.productId],
    )
    expect(Number((await price()).final_price)).toBe(35000)
  })

  it('una promocion desactivada deja de aplicarse al instante', async () => {
    const promo = await pg.one<{ id: string }>(
      `insert into public.promotions (title, discount_type, discount_value)
       values ('Liquidacion', 'percent', 50) returning id`,
    )
    await pg.query(
      `insert into public.promotion_targets (promotion_id, product_id) values ($1, $2)`,
      [promo!.id, ids.productId],
    )
    expect(Number((await price()).final_price)).toBe(20000)

    await pg.query(`update public.promotions set is_active = false where id = $1`, [promo!.id])
    expect(Number((await price()).final_price)).toBe(40000)
  })

  it('la vista del catalogo devuelve EXACTAMENTE el mismo precio que la funcion', async () => {
    // Esta es la prueba que impide que catalogo y ficha se desincronicen:
    // si alguien escribiera un segundo calculo de precio, este test lo caza.
    const promo = await pg.one<{ id: string }>(
      `insert into public.promotions (title, discount_type, discount_value)
       values ('25% off', 'percent', 25) returning id`,
    )
    await pg.query(
      `insert into public.promotion_targets (promotion_id, category_id) values ($1, $2)`,
      [promo!.id, ids.categoryId],
    )

    const fromView = await pg.one<{ final_price: string; list_price: string }>(
      `select final_price, list_price from public.v_catalog_products where id = $1`,
      [ids.productId],
    )
    const fromFn = await price()

    expect(Number(fromView!.final_price)).toBe(Number(fromFn.final_price))
    expect(Number(fromView!.list_price)).toBe(Number(fromFn.list_price))
  })

  it('nunca devuelve un precio negativo', async () => {
    const promo = await pg.one<{ id: string }>(
      `insert into public.promotions (title, discount_type, discount_value)
       values ('Descuento absurdo', 'amount_off', 999999) returning id`,
    )
    await pg.query(
      `insert into public.promotion_targets (promotion_id, product_id) values ($1, $2)`,
      [promo!.id, ids.productId],
    )
    expect(Number((await price()).final_price)).toBe(0)
  })
})
