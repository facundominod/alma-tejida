#!/usr/bin/env node
/**
 * Carga la estructura de precios de los respaldos.
 *
 *   npm run respaldos
 *
 * Crea —o actualiza, si ya existe— la pieza "Respaldo a medida" con sus
 * características y una combinación por cada cruce de ancho, diseño y madera,
 * cada una con su precio.
 *
 * Por qué así y no una tabla de precios aparte: porque el panel YA sabe editar
 * variantes. Poniendo los precios donde el sistema ya los busca, la dueña los
 * cambia desde la pantalla que ya usa, sin que nadie tenga que construirle una
 * pantalla nueva ni acordarse de mantener dos listas sincronizadas. Este
 * script es la carga inicial, no la fuente de verdad: a partir de acá manda la
 * base.
 *
 * Se corre UNA vez. Volver a correrlo pisa los precios con los de este archivo,
 * así que si ya se editaron desde el panel, no conviene.
 *
 * Usa el mismo RPC que usa el editor del panel (`admin_save_product_structure`),
 * que guarda todo en una transacción. Para eso necesita una sesión de
 * administradora: se la declara al principio con `set_config`, porque por una
 * conexión directa no hay JWT y `is_admin()` diría que no.
 */
import pg from 'pg'
import { config } from 'dotenv'

config({ path: '.env.local' })

/* =============================================================================
   LA TABLA DE PRECIOS

   Tal como está escrita en el cuaderno. Todo lo de acá se puede cambiar
   después desde /admin/productos sin tocar este archivo.
   ========================================================================== */

/** Alto fijo de todos los respaldos. */
const ALTO = '1,20 m'

/** Lo que cuesta de más la madera robusta, en todas las combinaciones. */
const RECARGO_MADERA_ANCHA = 30000

/** ancho → [precio líneas o cuadrillé, precio nido] */
const PRECIOS = [
  ['0,80 m', 150000, 190000],
  ['1,00 m', 165000, 195000],
  ['1,40 m', 210000, 240000],
  ['1,50 m', 215000, 245000],
  ['1,60 m', 220000, 265000],
  ['1,80 m', 230000, 270000],
  ['2,00 m', 240000, 290000],
]

/** Los tres dibujos. Líneas y Cuadrillé valen lo mismo; Nido, más. */
const DISENOS = [
  { nombre: 'Líneas', columna: 1 },
  { nombre: 'Cuadrillé', columna: 1 },
  { nombre: 'Nido', columna: 2 },
]

const MADERAS = [
  { nombre: '4 × 3,5 cm', recargo: 0 },
  { nombre: '6 × 4 cm (más robusta)', recargo: RECARGO_MADERA_ANCHA },
]

const DESCRIPCION = `Respaldos tejidos a mano, uno por uno, con bastidor de madera.

Todos llevan ${ALTO} de alto. El ancho lo elegís vos, y el dibujo del tejido también: líneas, cuadrillé o nido.

La madera viene de 4 × 3,5 cm. Si querés un bastidor más robusto, la de 6 × 4 cm suma $${RECARGO_MADERA_ANCHA.toLocaleString('es-AR')}.

Estos precios son una guía general. Cada respaldo se hace a medida, así que si tu cama tiene una medida que no está en la lista, o se te ocurre algo distinto, escribinos y lo vemos: casi siempre se puede.`

/* =============================================================================
   CARGA
   ========================================================================== */

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('\nFalta SUPABASE_DB_URL en .env.local. Corré antes: npm run db:configurar\n')
  process.exit(1)
}

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await db.connect()

try {
  // El RPC exige ser administradora, y por una conexión directa no hay JWT.
  // Se declara la sesión con la cuenta admin que ya existe en la tienda.
  const admin = await db.query(
    `select id from public.profiles where role = 'admin' order by created_at limit 1`,
  )
  if (admin.rows.length === 0) {
    console.error('\nNo hay ninguna administradora. Corré antes: npm run admin -- tu-usuario\n')
    process.exit(1)
  }
  const adminId = admin.rows[0].id

  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: adminId, role: 'authenticated' }),
  ])

  const categoria = await db.query(
    `select id from public.categories where slug = 'respaldos' and deleted_at is null`,
  )
  if (categoria.rows.length === 0) {
    console.error('\nNo existe la categoria "respaldos".\n')
    process.exit(1)
  }

  // El precio base de la pieza es el más barato: es el que se muestra como
  // "desde" en el catálogo.
  const precioBase = Math.min(...PRECIOS.map(([, lc]) => lc))

  const producto = await db.query(
    `insert into public.products
       (category_id, name, slug, short_description, description, base_price,
        availability_mode, stock_display, status, is_featured)
     values ($1, 'Respaldo a medida', 'respaldo-a-medida',
             'Tejido a mano, ${ALTO} de alto. Elegís el ancho y el dibujo.',
             $2, $3, 'made_to_order', 'hidden', 'published', true)
     -- El indice unico de slug es PARCIAL (solo donde deleted_at is null),
     -- asi que el on conflict tiene que repetir esa condicion o Postgres no
     -- encuentra con que indice resolverlo.
     on conflict (slug) where deleted_at is null do update
        set category_id = excluded.category_id,
            short_description = excluded.short_description,
            description = excluded.description,
            base_price = excluded.base_price,
            availability_mode = excluded.availability_mode,
            stock_display = excluded.stock_display
     returning id`,
    [categoria.rows[0].id, DESCRIPCION, precioBase],
  )
  const productoId = producto.rows[0].id

  /* --- El payload, igual al que manda el editor del panel ----------------- */

  const payload = {
    attributes: [
      {
        key: 'ancho',
        name: 'Ancho',
        type: 'measure',
        values: PRECIOS.map(([ancho], i) => ({ key: `ancho-${i}`, value: ancho })),
      },
      {
        key: 'diseno',
        name: 'Diseño',
        type: 'select',
        values: DISENOS.map((d, i) => ({ key: `diseno-${i}`, value: d.nombre })),
      },
      {
        key: 'madera',
        name: 'Madera',
        type: 'select',
        values: MADERAS.map((m, i) => ({ key: `madera-${i}`, value: m.nombre })),
      },
    ],
    variants: [],
  }

  for (const [iAncho, fila] of PRECIOS.entries()) {
    for (const [iDiseno, diseno] of DISENOS.entries()) {
      for (const [iMadera, madera] of MADERAS.entries()) {
        const precio = fila[diseno.columna] + madera.recargo
        payload.variants.push({
          options: {
            ancho: `ancho-${iAncho}`,
            diseno: `diseno-${iDiseno}`,
            madera: `madera-${iMadera}`,
          },
          price_override: String(precio),
        })
      }
    }
  }

  const { rows } = await db.query(
    `select public.admin_save_product_structure($1, $2) as resultado`,
    [productoId, JSON.stringify(payload)],
  )

  console.log(`
  ✓ "Respaldo a medida" cargado.

    ${PRECIOS.length} anchos × ${DISENOS.length} dibujos × ${MADERAS.length} maderas
    = ${payload.variants.length} combinaciones, cada una con su precio.

    ${JSON.stringify(rows[0].resultado)}

    Desde $${precioBase.toLocaleString('es-AR')}. Todo editable en
    /admin/productos → Respaldo a medida → Características.
`)
} finally {
  await db.end()
}
