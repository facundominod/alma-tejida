/**
 * Datos de demostración para desarrollo (puntos 192, 195).
 *
 * TODO lo que crea este script queda marcado. Los productos y categorías
 * llevan el prefijo `demo-` en el slug, así que `npm run seed:clean` los
 * borra en bloque sin tocar nada real.
 *
 * Y antes de escribir una sola fila, se niega a correr si la URL parece de
 * producción. Un seed ejecutado por error contra la base real contaminaría
 * las analíticas y metería productos inventados en la tienda.
 *
 *   npm run seed         → carga los datos demo
 *   npm run seed:clean   → los borra
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const productionUrl = process.env.PRODUCTION_SUPABASE_URL

if (!url || !serviceKey) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

// --- LA GUARDA -------------------------------------------------------------
if (process.env.NODE_ENV === 'production') {
  console.error('✖ NODE_ENV=production. El seed no corre en producción.')
  process.exit(1)
}

if (productionUrl && url === productionUrl) {
  console.error('✖ Esta URL es la de producción. El seed no corre acá.')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const DEMO_PREFIX = 'demo-'

const CATEGORIES = [
  { name: 'Mantas', slug: `${DEMO_PREFIX}mantas`, position: 1 },
  { name: 'Almohadones', slug: `${DEMO_PREFIX}almohadones`, position: 2 },
  { name: 'Decoracion', slug: `${DEMO_PREFIX}decoracion`, position: 3 },
  { name: 'Bebes', slug: `${DEMO_PREFIX}bebes`, position: 4 },
]

type SeedProduct = {
  name: string
  slug: string
  category: string
  basePrice: number
  shortDescription: string
  description: string
  availability?: 'in_stock' | 'made_to_order' | 'unique_piece'
  leadTimeDays?: number
  featured?: boolean
  attributes?: Array<{
    name: string
    type: 'select' | 'color' | 'measure'
    values: Array<{ value: string; color?: string }>
  }>
  /** Combinaciones que NO se fabrican, por etiqueta */
  skip?: string[]
  stockPerVariant?: number
}

const PRODUCTS: SeedProduct[] = [
  {
    name: 'Manta Roma',
    slug: `${DEMO_PREFIX}manta-roma`,
    category: `${DEMO_PREFIX}mantas`,
    basePrice: 48000,
    shortDescription: 'Tejida en punto trenzado, con algodón peinado.',
    description:
      'Una manta de punto trenzado, tejida en dos agujas con algodón peinado.\n\n' +
      'Liviana pero abrigada, pensada para el respaldo del sillón o los pies de la cama.\n\n' +
      'Cuidado: lavar a mano con agua fría y secar en plano.',
    featured: true,
    attributes: [
      {
        name: 'Color',
        type: 'color',
        values: [
          { value: 'Crudo', color: '#EFE6DA' },
          { value: 'Rosa viejo', color: '#DCAE9B' },
          { value: 'Verde salvia', color: '#8E9B87' },
        ],
      },
      {
        name: 'Medida',
        type: 'measure',
        values: [{ value: '1,20 x 1,50' }, { value: '1,50 x 2,00' }],
      },
    ],
    // El administrador no fabrica el verde en medida grande
    skip: ['Verde salvia · 1,50 x 2,00'],
    stockPerVariant: 3,
  },
  {
    name: 'Almohadon Corazon',
    slug: `${DEMO_PREFIX}almohadon-corazon`,
    category: `${DEMO_PREFIX}almohadones`,
    basePrice: 14500,
    shortDescription: 'Con relleno de vellón siliconado y funda desmontable.',
    description: 'Almohadón tejido a mano, 40 × 40 cm. La funda sale para lavar.',
    featured: true,
    attributes: [
      {
        name: 'Color',
        type: 'color',
        values: [
          { value: 'Crudo', color: '#EFE6DA' },
          { value: 'Terracota', color: '#C08A7C' },
        ],
      },
    ],
    stockPerVariant: 6,
  },
  {
    name: 'Tapiz Luna',
    slug: `${DEMO_PREFIX}tapiz-luna`,
    category: `${DEMO_PREFIX}decoracion`,
    basePrice: 86000,
    shortDescription: 'Macramé sobre rama de madera. Una sola, irrepetible.',
    description:
      'Tapiz de macramé montado sobre una rama recogida a mano.\n\n' +
      'Cada rama es distinta, así que esta pieza no se repite.',
    availability: 'unique_piece',
    featured: true,
    stockPerVariant: 1,
  },
  {
    name: 'Manta Nordica',
    slug: `${DEMO_PREFIX}manta-nordica`,
    category: `${DEMO_PREFIX}mantas`,
    basePrice: 124000,
    shortDescription: 'Se teje por encargo, en el color que elijas.',
    description: 'Lana merino, punto inglés. Se teje especialmente para cada pedido.',
    availability: 'made_to_order',
    leadTimeDays: 15,
    attributes: [
      {
        name: 'Tipo de lana',
        type: 'select',
        values: [{ value: 'Merino' }, { value: 'Alpaca' }],
      },
    ],
    stockPerVariant: 0,
  },
  {
    name: 'Gorro Nube',
    slug: `${DEMO_PREFIX}gorro-nube`,
    category: `${DEMO_PREFIX}bebes`,
    basePrice: 9800,
    shortDescription: 'Para recién nacidos, en algodón suave.',
    description: 'Gorrito tejido en algodón, sin costuras que molesten.',
    attributes: [
      {
        name: 'Talle',
        type: 'select',
        values: [{ value: '0-3 meses' }, { value: '3-6 meses' }, { value: '6-12 meses' }],
      },
    ],
    stockPerVariant: 4,
  },
  {
    name: 'Camino de mesa Trigo',
    slug: `${DEMO_PREFIX}camino-mesa-trigo`,
    category: `${DEMO_PREFIX}decoracion`,
    basePrice: 22000,
    shortDescription: 'Punto calado en hilo de algodón, 40 × 140 cm.',
    description: 'Camino de mesa en punto calado. Se lava a máquina en frío.',
    stockPerVariant: 2,
  },
]

async function seed() {
  console.log('→ Cargando datos de demostración...\n')

  // --- Categorías ---
  const categoryIds = new Map<string, string>()
  for (const category of CATEGORIES) {
    const { data, error } = await supabase
      .from('categories')
      .upsert({ ...category, is_visible: true }, { onConflict: 'slug' })
      .select('id, slug')
      .single()

    if (error) throw error
    categoryIds.set(data.slug, data.id)
    console.log(`  categoría  ${category.name}`)
  }

  // --- Productos ---
  for (const product of PRODUCTS) {
    const { data: created, error } = await supabase
      .from('products')
      .upsert(
        {
          name: product.name,
          slug: product.slug,
          category_id: categoryIds.get(product.category),
          short_description: product.shortDescription,
          description: product.description,
          base_price: product.basePrice,
          availability_mode: product.availability ?? 'in_stock',
          lead_time_days: product.leadTimeDays ?? null,
          is_featured: product.featured ?? false,
          status: 'published',
        },
        { onConflict: 'slug' },
      )
      .select('id')
      .single()

    if (error) throw error

    // --- Estructura (atributos + combinaciones) ---
    if (product.attributes?.length) {
      const attributes = product.attributes.map((attr, index) => ({
        key: `a${index}`,
        name: attr.name,
        type: attr.type,
        values: attr.values.map((value, valueIndex) => ({
          key: `a${index}v${valueIndex}`,
          value: value.value,
          color_hex: value.color ?? null,
        })),
      }))

      // Producto cartesiano
      let combos: Array<Record<string, string>> = [{}]
      for (const attr of attributes) {
        combos = combos.flatMap((combo) =>
          attr.values.map((value) => ({ ...combo, [attr.key]: value.key })),
        )
      }

      const labelOf = (options: Record<string, string>) =>
        attributes
          .map((attr) => attr.values.find((v) => v.key === options[attr.key])?.value)
          .filter(Boolean)
          .join(' · ')

      const variants = combos
        .filter((options) => !product.skip?.includes(labelOf(options)))
        .map((options) => ({ options, is_active: true }))

      const { error: structureError } = await supabase.rpc(
        'admin_save_product_structure',
        { p_product_id: created.id, p_payload: { attributes, variants } },
      )

      // La RPC exige ser admin; con service_role is_admin() da false.
      // Por eso el seed escribe la estructura directo (ver nota abajo).
      if (structureError) {
        await seedStructureDirectly(created.id, attributes, variants)
      }
    }

    // --- Stock inicial, con su movimiento ---
    const { data: variantRows } = await supabase
      .from('product_variants')
      .select('id, stock')
      .eq('product_id', created.id)

    for (const variant of variantRows ?? []) {
      const target = product.stockPerVariant ?? 0
      const delta = target - variant.stock
      if (delta === 0) continue

      const { data: after } = await supabase
        .from('product_variants')
        .update({ stock: variant.stock + delta })
        .eq('id', variant.id)
        .select('stock, reserved')
        .single()

      if (after) {
        await supabase.from('inventory_movements').insert({
          variant_id: variant.id,
          movement_type: 'initial',
          stock_delta: delta,
          reserved_delta: 0,
          stock_after: after.stock,
          reserved_after: after.reserved,
          note: 'Carga demo',
        })
      }
    }

    console.log(`  producto   ${product.name}`)
  }

  // --- Una promoción vigente ---
  const { data: promo } = await supabase
    .from('promotions')
    .upsert(
      {
        title: '20% en mantas',
        description: 'Hasta fin de mes, en todas las mantas tejidas a mano.',
        discount_type: 'percent',
        discount_value: 20,
        ends_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        is_active: true,
        show_in_hero: true,
        cta_label: 'Ver mantas',
        cta_href: `/categoria/${DEMO_PREFIX}mantas`,
      },
      { onConflict: 'title' },
    )
    .select('id')
    .maybeSingle()

  if (promo) {
    await supabase.from('promotion_targets').delete().eq('promotion_id', promo.id)
    await supabase.from('promotion_targets').insert({
      promotion_id: promo.id,
      category_id: categoryIds.get(`${DEMO_PREFIX}mantas`),
    })
    console.log('  promoción  20% en mantas')
  }

  console.log('\n✓ Listo. Todo lo creado lleva el prefijo "demo-".')
  console.log('  Para borrarlo: npm run seed:clean\n')
}

/**
 * El seed corre con service_role, que saltea RLS pero NO es admin: is_admin()
 * lee auth.uid(), que acá es null. Así que la estructura se escribe directo.
 * Es aceptable sólo porque este script jamás toca producción.
 */
async function seedStructureDirectly(
  productId: string,
  attributes: Array<{
    key: string
    name: string
    type: string
    values: Array<{ key: string; value: string; color_hex: string | null }>
  }>,
  variants: Array<{ options: Record<string, string>; is_active: boolean }>,
) {
  const keyMap = new Map<string, string>()

  for (const [index, attr] of attributes.entries()) {
    const { data: attrRow } = await supabase
      .from('product_attributes')
      .upsert(
        { product_id: productId, name: attr.name, type: attr.type, position: index },
        { onConflict: 'product_id,name' },
      )
      .select('id')
      .single()

    if (!attrRow) continue
    keyMap.set(attr.key, attrRow.id)

    for (const [valueIndex, value] of attr.values.entries()) {
      const { data: valueRow } = await supabase
        .from('product_attribute_values')
        .upsert(
          {
            attribute_id: attrRow.id,
            value: value.value,
            color_hex: value.color_hex,
            position: valueIndex,
          },
          { onConflict: 'attribute_id,value' },
        )
        .select('id')
        .single()

      if (valueRow) keyMap.set(value.key, valueRow.id)
    }
  }

  // La variante por defecto que creó el trigger sobra en cuanto hay opciones
  await supabase
    .from('product_variants')
    .delete()
    .eq('product_id', productId)
    .eq('is_default', true)

  for (const [index, variant] of variants.entries()) {
    const { data: variantRow } = await supabase
      .from('product_variants')
      .insert({ product_id: productId, is_active: variant.is_active, position: index })
      .select('id')
      .single()

    if (!variantRow) continue

    for (const [attrKey, valueKey] of Object.entries(variant.options)) {
      await supabase.from('variant_option_values').insert({
        variant_id: variantRow.id,
        attribute_id: keyMap.get(attrKey)!,
        value_id: keyMap.get(valueKey)!,
      })
    }
  }
}

async function clean() {
  console.log('→ Borrando datos de demostración...\n')

  const { data: products } = await supabase
    .from('products')
    .select('id')
    .like('slug', `${DEMO_PREFIX}%`)

  const ids = (products ?? []).map((p) => p.id)

  if (ids.length > 0) {
    // Las analíticas de los demo se van con ellos: no tiene que quedar una
    // sola visita inventada contaminando las métricas reales (punto 192).
    await supabase.from('analytics_events').delete().in('product_id', ids)
    await supabase.from('analytics_daily').delete().in('product_id', ids)
    await supabase.from('products').delete().in('id', ids)
    console.log(`  ${ids.length} productos borrados`)
  }

  await supabase.from('categories').delete().like('slug', `${DEMO_PREFIX}%`)
  await supabase.from('promotions').delete().eq('title', '20% en mantas')

  console.log('\n✓ Base limpia.\n')
}

const command = process.argv[2]

if (command === 'clean') {
  clean().catch((error) => {
    console.error(error)
    process.exit(1)
  })
} else {
  seed().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
