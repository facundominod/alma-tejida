import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestDb, seedBasics, type Db } from './harness'

describe('esquema', () => {
  let pg: Db

  beforeAll(async () => {
    pg = await createTestDb()
  })

  afterAll(async () => {
    await pg?.close()
  })

  it('aplica todas las migraciones sobre una base vacia', async () => {
    const tables = await pg.rows<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
        order by table_name`,
    )
    const names = tables.map((t) => t.table_name)

    expect(names).toEqual(
      expect.arrayContaining([
        'products',
        'product_variants',
        'product_attributes',
        'product_attribute_values',
        'variant_option_values',
        'product_media',
        'orders',
        'order_items',
        'inventory_movements',
        'promotions',
        'questions',
        'reviews',
        'notifications',
        'analytics_events',
        'analytics_daily',
        'audit_log',
        'store_settings',
      ]),
    )
  })

  it('deja RLS activo en TODAS las tablas de negocio', async () => {
    const unprotected = await pg.rows<{ tablename: string }>(
      `select tablename from pg_tables
        where schemaname = 'public'
          and not rowsecurity
        order by tablename`,
    )
    expect(unprotected.map((t) => t.tablename)).toEqual([])
  })

  it('no deja ninguna tabla con RLS activo y cero policies sin que sea a proposito', async () => {
    const rows = await pg.rows<{ tablename: string }>(
      `select t.tablename
         from pg_tables t
    left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
        where t.schemaname = 'public'
        group by t.tablename
       having count(p.policyname) = 0
        order by t.tablename`,
    )
    // Estas no tienen policies A PROPOSITO: nadie las toca desde el
    // navegador, se escriben y se leen solo desde funciones SECURITY DEFINER.
    //
    // La lista es exacta y no un "al menos estas": una tabla nueva con RLS y
    // sin una sola policy es invisible para la aplicacion, y casi siempre eso
    // significa que alguien se olvido de escribirla. Que esta prueba falle al
    // agregar una tabla es el comportamiento buscado; sumarla aca es declarar
    // que el silencio es deliberado.
    expect(rows.map((r) => r.tablename)).toEqual([
      'analytics_events',
      'rate_limit_hits',
      // Solo la lee username_disponible(). Exponerla seria publicar la lista
      // de nombres que la tienda se reserva.
      'reserved_usernames',
    ])
  })

  it('crea una variante por defecto para todo producto nuevo (decision D1)', async () => {
    const { productId } = await seedBasics(pg)

    const variants = await pg.rows(
      `select * from public.product_variants where product_id = $1`,
      [productId],
    )
    expect(variants).toHaveLength(1)
    expect(variants[0]).toMatchObject({ is_default: true, is_active: true })
  })

  it('fija published_at la primera vez que se publica, y no lo rejuvenece despues', async () => {
    await pg.asService()
    const p = await pg.one<{ id: string; published_at: string }>(
      `insert into public.products (name, slug, base_price, status)
       values ('Gorro Nube', 'gorro-nube', 12000, 'published')
       returning id, published_at`,
    )
    expect(p!.published_at).not.toBeNull()

    await pg.query(`update public.products set status = 'draft' where id = $1`, [p!.id])
    await pg.query(`update public.products set status = 'published' where id = $1`, [p!.id])

    const after = await pg.one<{ published_at: string }>(
      `select published_at from public.products where id = $1`,
      [p!.id],
    )
    expect(new Date(after!.published_at).getTime()).toBe(
      new Date(p!.published_at).getTime(),
    )
  })

  it('indexa el producto para busqueda sin acentos', async () => {
    await pg.asService()
    await pg.query(
      `insert into public.products (name, slug, base_price, status, description)
       values ('Almohadon Corazon', 'almohadon-corazon', 9000, 'published',
               'Tejido a mano con lana merino')`,
    )

    const found = await pg.rows<{ name: string }>(
      `select name from public.search_products('almohadon')`,
    )
    expect(found.map((f) => f.name)).toContain('Almohadon Corazon')

    // sin acentos y con la palabra escrita "mal" a proposito
    const accented = await pg.rows<{ name: string }>(
      `select name from public.search_products('almohadón')`,
    )
    expect(accented.map((f) => f.name)).toContain('Almohadon Corazon')
  })
})
