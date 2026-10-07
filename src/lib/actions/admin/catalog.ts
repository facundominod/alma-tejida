'use server'

import 'server-only'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient, requireAdmin } from '@/lib/supabase/server'
import { slugify } from '@/lib/utils'

/**
 * Gestion del catálogo.
 *
 * Toda acción empieza por requireAdmin(), que consulta el rol EN LA BASE.
 * Después, las policies de RLS vuelven a exigirlo en cada escritura: dos
 * capas independientes, ninguna confiando en la otra.
 *
 * El stock NUNCA se escribe desde acá. Para eso existe adjust_stock(), que
 * deja su movimiento.
 */

export type AdminResult<T = object> = ({ ok: true } & T) | { ok: false; error: string }

/** Publicar o cambiar algo tiene que verse en la tienda AL INSTANTE (punto 190). */
async function refreshStorefront(slug?: string | null) {
  revalidatePath('/', 'page')
  revalidatePath('/tienda', 'page')
  revalidatePath('/ofertas', 'page')
  revalidatePath('/novedades', 'page')
  if (slug) revalidatePath(`/producto/${slug}`, 'page')
}

/* =============================================================================
   PRODUCTOS
   ========================================================================== */

const productSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, 'La pieza necesita un nombre.').max(160),
  slug: z.string().trim().max(160).optional(),
  categoryId: z.string().uuid().nullish(),
  shortDescription: z.string().trim().max(300).optional(),
  description: z.string().trim().max(8000).optional(),
  basePrice: z.number().nonnegative('El precio no puede ser negativo.'),
  salePrice: z.number().positive().nullish(),
  saleStartsAt: z.string().nullish(),
  saleEndsAt: z.string().nullish(),
  availabilityMode: z.enum(['in_stock', 'made_to_order', 'unique_piece']),
  leadTimeDays: z.number().int().positive().nullish(),
  stockDisplay: z.enum(['exact', 'vague', 'hidden']),
  lowStockThreshold: z.number().int().nonnegative(),
  showWhenOutOfStock: z.boolean(),
  isFeatured: z.boolean(),
  featuredPosition: z.number().int().nonnegative().optional(),
  status: z.enum(['draft', 'published', 'archived']),
})

export async function saveProduct(
  input: unknown,
): Promise<AdminResult<{ productId: string; slug: string }>> {
  await requireAdmin()

  const parsed = productSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisá los datos.' }
  }

  const data = parsed.data

  // El precio promocional tiene que ser menor que el normal: la base lo
  // exige con un CHECK, pero conviene decirlo antes y con palabras.
  if (data.salePrice != null && data.salePrice >= data.basePrice) {
    return { ok: false, error: 'El precio promocional tiene que ser menor que el normal.' }
  }

  if (data.availabilityMode !== 'made_to_order' && data.leadTimeDays != null) {
    return {
      ok: false,
      error: 'El tiempo de elaboración solo aplica a las piezas que se hacen por encargo.',
    }
  }

  const supabase = await createClient()
  const slug = await uniqueSlug(supabase, data.slug || slugify(data.name), data.id)

  const row = {
    name: data.name,
    slug,
    category_id: data.categoryId ?? null,
    short_description: data.shortDescription || null,
    description: data.description || null,
    base_price: data.basePrice,
    sale_price: data.salePrice ?? null,
    sale_starts_at: data.saleStartsAt || null,
    sale_ends_at: data.saleEndsAt || null,
    availability_mode: data.availabilityMode,
    lead_time_days: data.leadTimeDays ?? null,
    stock_display: data.stockDisplay,
    low_stock_threshold: data.lowStockThreshold,
    show_when_out_of_stock: data.showWhenOutOfStock,
    is_featured: data.isFeatured,
    featured_position: data.featuredPosition ?? 0,
    status: data.status,
  }

  if (data.id) {
    const { error } = await supabase.from('products').update(row).eq('id', data.id)
    if (error) return { ok: false, error: 'No pudimos guardar los cambios.' }

    await refreshStorefront(slug)
    return { ok: true, productId: data.id, slug }
  }

  const { data: created, error } = await supabase
    .from('products')
    .insert(row)
    .select('id, slug')
    .single()

  if (error || !created) return { ok: false, error: 'No pudimos crear la pieza.' }

  await refreshStorefront(created.slug)
  return { ok: true, productId: created.id, slug: created.slug }
}

/**
 * Guarda características y variantes de una sola vez.
 * La atomicidad la garantiza la función SQL, no esta acción.
 */
const structureSchema = z.object({
  productId: z.string().uuid(),
  attributes: z.array(
    z.object({
      key: z.string().min(1),
      id: z.string().uuid().nullish(),
      name: z.string().trim().min(1).max(60),
      type: z.enum(['select', 'text', 'number', 'measure', 'color']),
      values: z.array(
        z.object({
          key: z.string().min(1),
          id: z.string().uuid().nullish(),
          value: z.string().trim().min(1).max(80),
          color_hex: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .nullish(),
        }),
      ),
    }),
  ),
  variants: z.array(
    z.object({
      id: z.string().uuid().nullish(),
      options: z.record(z.string(), z.string()),
      sku: z.string().trim().max(60).nullish(),
      price_override: z.string().nullish(),
      low_stock_threshold: z.string().nullish(),
      is_active: z.boolean().optional(),
    }),
  ),
})

export async function saveProductStructure(input: unknown): Promise<AdminResult> {
  await requireAdmin()

  const parsed = structureSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Revisá las características y variantes.' }
  }

  // Una característica de tipo selección sin valores no sirve para nada
  const empty = parsed.data.attributes.find((a) => a.values.length === 0)
  if (empty) {
    return { ok: false, error: `"${empty.name}" necesita al menos una opción.` }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_save_product_structure', {
    p_product_id: parsed.data.productId,
    p_payload: {
      attributes: parsed.data.attributes,
      variants: parsed.data.variants,
    },
  })

  if (error) {
    if (error.message.includes('FORBIDDEN')) {
      return { ok: false, error: 'No tenés permiso para esta acción.' }
    }
    return { ok: false, error: 'No pudimos guardar las variantes.' }
  }

  const { data: product } = await supabase
    .from('products')
    .select('slug')
    .eq('id', parsed.data.productId)
    .maybeSingle()

  revalidatePath(`/admin/productos/${parsed.data.productId}`)
  await refreshStorefront(product?.slug)
  return { ok: true }
}

export async function setProductStatus(
  productId: string,
  status: 'draft' | 'published' | 'archived',
): Promise<AdminResult> {
  await requireAdmin()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('products')
    .update({ status })
    .eq('id', productId)
    .select('slug')
    .single()

  if (error) return { ok: false, error: 'No pudimos cambiar el estado.' }

  revalidatePath('/admin/productos')
  await refreshStorefront(data?.slug)
  return { ok: true }
}

/**
 * Duplicar: copia información, características y variantes; NO copia stock ni
 * fotos. El stock de una pieza no se hereda, y las fotos son de la pieza
 * original.
 */
export async function duplicateProduct(
  productId: string,
): Promise<AdminResult<{ productId: string }>> {
  await requireAdmin()
  const supabase = await createClient()

  const { data: original } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .maybeSingle()

  if (!original) return { ok: false, error: 'La pieza ya no existe.' }

  const slug = await uniqueSlug(supabase, `${original.slug}-copia`)

  const { data: copy, error } = await supabase
    .from('products')
    .insert({
      name: `${original.name} (copia)`,
      slug,
      category_id: original.category_id,
      short_description: original.short_description,
      description: original.description,
      base_price: original.base_price,
      availability_mode: original.availability_mode,
      lead_time_days: original.lead_time_days,
      stock_display: original.stock_display,
      low_stock_threshold: original.low_stock_threshold,
      show_when_out_of_stock: original.show_when_out_of_stock,
      // Una copia SIEMPRE nace en borrador: nadie quiere publicar un
      // duplicado sin querer.
      status: 'draft',
    })
    .select('id')
    .single()

  if (error || !copy) return { ok: false, error: 'No pudimos duplicar la pieza.' }

  // Se replican características y combinaciones con la misma función que usa
  // el editor: una sola implementación para los dos caminos.
  // Sin embeds: cuatro consultas planas y el armado en memoria. Más simple
  // de tipar y sin depender de que PostgREST infiera relaciones.
  const [attrsRes, valuesRes, variantsRes, optionsRes] = await Promise.all([
    supabase.from('product_attributes').select('*').eq('product_id', productId).order('position'),
    supabase
      .from('product_attribute_values')
      .select('*, product_attributes!inner(product_id)')
      .eq('product_attributes.product_id', productId)
      .order('position')
      .returns<Array<{ id: string; attribute_id: string; value: string; color_hex: string | null }>>(),
    supabase
      .from('product_variants')
      .select('*')
      .eq('product_id', productId)
      .eq('is_active', true)
      .order('position'),
    supabase
      .from('variant_option_values')
      .select('*, product_variants!inner(product_id)')
      .eq('product_variants.product_id', productId)
      .returns<Array<{ variant_id: string; attribute_id: string; value_id: string }>>(),
  ])

  const attrRows = attrsRes.data ?? []
  const valueRows = valuesRes.data ?? []
  const variantRows = variantsRes.data ?? []
  const optionRows = optionsRes.data ?? []

  if (attrRows.length > 0) {
    await supabase.rpc('admin_save_product_structure', {
      p_product_id: copy.id,
      p_payload: {
        attributes: attrRows.map((attr) => ({
          key: attr.id,
          name: attr.name,
          type: attr.type,
          values: valueRows
            .filter((value) => value.attribute_id === attr.id)
            .map((value) => ({
              key: value.id,
              value: value.value,
              color_hex: value.color_hex,
            })),
        })),
        variants: variantRows.map((variant) => ({
          sku: variant.sku ? `${variant.sku}-COPIA` : null,
          price_override: variant.price_override?.toString() ?? null,
          is_active: true,
          options: Object.fromEntries(
            optionRows
              .filter((option) => option.variant_id === variant.id)
              .map((option) => [option.attribute_id, option.value_id]),
          ),
        })),
      },
    })
  }

  revalidatePath('/admin/productos')
  return { ok: true, productId: copy.id }
}

/**
 * Archivar, no borrar (punto 101). Un producto con ventas es historia, y la
 * historia no se borra.
 */
export async function archiveProduct(productId: string): Promise<AdminResult> {
  return setProductStatus(productId, 'archived')
}

/** Borrado suave. Solo se permite si la pieza nunca se vendio. */
export async function deleteProduct(productId: string): Promise<AdminResult> {
  await requireAdmin()
  const supabase = await createClient()

  const { count } = await supabase
    .from('order_items')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId)

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error:
        'Esta pieza ya tuvo ventas, así que no se borra: archivala para sacarla de la tienda sin perder el historial.',
    }
  }

  const { error } = await supabase
    .from('products')
    .update({ deleted_at: new Date().toISOString(), status: 'archived' })
    .eq('id', productId)

  if (error) return { ok: false, error: 'No pudimos borrar la pieza.' }

  revalidatePath('/admin/productos')
  await refreshStorefront()
  return { ok: true }
}

/* =============================================================================
   CATEGORIAS
   ========================================================================== */

const categorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, 'La categoría necesita un nombre.').max(80),
  slug: z.string().trim().max(80).optional(),
  description: z.string().trim().max(500).optional(),
  parentId: z.string().uuid().nullish(),
  position: z.number().int().nonnegative().optional(),
  isVisible: z.boolean(),
})

export async function saveCategory(input: unknown): Promise<AdminResult> {
  await requireAdmin()

  const parsed = categorySchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisá los datos.' }
  }

  const data = parsed.data
  const supabase = await createClient()

  const row = {
    name: data.name,
    slug: data.slug || slugify(data.name),
    description: data.description || null,
    parent_id: data.parentId ?? null,
    position: data.position ?? 0,
    is_visible: data.isVisible,
  }

  const { error } = data.id
    ? await supabase.from('categories').update(row).eq('id', data.id)
    : await supabase.from('categories').insert(row)

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'Ya existe una categoría con ese nombre.' }
    }
    return { ok: false, error: 'No pudimos guardar la categoría.' }
  }

  revalidatePath('/admin/categorias')
  await refreshStorefront()
  return { ok: true }
}

export async function deleteCategory(categoryId: string): Promise<AdminResult> {
  await requireAdmin()
  const supabase = await createClient()

  const { count } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', categoryId)
    .is('deleted_at', null)

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Hay ${count} piezas en esta categoría. Movelas a otra antes de borrarla.`,
    }
  }

  const { error } = await supabase
    .from('categories')
    .update({ deleted_at: new Date().toISOString(), is_visible: false })
    .eq('id', categoryId)

  if (error) return { ok: false, error: 'No pudimos borrar la categoría.' }

  revalidatePath('/admin/categorias')
  await refreshStorefront()
  return { ok: true }
}

/* =============================================================================
   PROMOCIONES
   ========================================================================== */

const promotionSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(2, 'La promoción necesita un título.').max(120),
  description: z.string().trim().max(300).optional(),
  discountType: z.enum(['percent', 'fixed_price', 'amount_off']),
  discountValue: z.number().positive('El descuento tiene que ser mayor que cero.'),
  startsAt: z.string().nullish(),
  endsAt: z.string().nullish(),
  isActive: z.boolean(),
  showInHero: z.boolean(),
  position: z.number().int().nonnegative().optional(),
  ctaLabel: z.string().trim().max(40).optional(),
  ctaHref: z.string().trim().max(200).optional(),
  productIds: z.array(z.string().uuid()).default([]),
  categoryIds: z.array(z.string().uuid()).default([]),
})

export async function savePromotion(input: unknown): Promise<AdminResult> {
  await requireAdmin()

  const parsed = promotionSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisá los datos.' }
  }

  const data = parsed.data

  if (data.discountType === 'percent' && data.discountValue > 100) {
    return { ok: false, error: 'Un porcentaje no puede pasar de 100.' }
  }

  if (data.productIds.length === 0 && data.categoryIds.length === 0) {
    return { ok: false, error: 'Elegí al menos un producto o una categoría.' }
  }

  const supabase = await createClient()

  const row = {
    title: data.title,
    description: data.description || null,
    discount_type: data.discountType,
    discount_value: data.discountValue,
    starts_at: data.startsAt || null,
    ends_at: data.endsAt || null,
    is_active: data.isActive,
    show_in_hero: data.showInHero,
    position: data.position ?? 0,
    cta_label: data.ctaLabel || null,
    cta_href: data.ctaHref || null,
  }

  let promotionId = data.id

  if (promotionId) {
    const { error } = await supabase.from('promotions').update(row).eq('id', promotionId)
    if (error) return { ok: false, error: 'No pudimos guardar la promoción.' }
  } else {
    const { data: created, error } = await supabase
      .from('promotions')
      .insert(row)
      .select('id')
      .single()
    if (error || !created) return { ok: false, error: 'No pudimos crear la promoción.' }
    promotionId = created.id
  }

  // Se reescribe el alcance completo: más simple y sin estados a medias.
  await supabase.from('promotion_targets').delete().eq('promotion_id', promotionId)

  const targets = [
    ...data.productIds.map((id) => ({ promotion_id: promotionId!, product_id: id })),
    ...data.categoryIds.map((id) => ({ promotion_id: promotionId!, category_id: id })),
  ]

  if (targets.length > 0) {
    await supabase.from('promotion_targets').insert(targets)
  }

  revalidatePath('/admin/promociones')
  await refreshStorefront()
  return { ok: true }
}

export async function togglePromotion(
  promotionId: string,
  isActive: boolean,
): Promise<AdminResult> {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('promotions')
    .update({ is_active: isActive })
    .eq('id', promotionId)

  if (error) return { ok: false, error: 'No pudimos cambiar la promoción.' }

  revalidatePath('/admin/promociones')
  await refreshStorefront()
  return { ok: true }
}

export async function deletePromotion(promotionId: string): Promise<AdminResult> {
  await requireAdmin()
  const supabase = await createClient()

  // Los pedidos guardan el título de la promoción congelado en order_items,
  // así que borrarla no altera ninguna venta pasada (punto 172).
  const { error } = await supabase.from('promotions').delete().eq('id', promotionId)

  if (error) return { ok: false, error: 'No pudimos borrar la promoción.' }

  revalidatePath('/admin/promociones')
  await refreshStorefront()
  return { ok: true }
}

/* =============================================================================
   AUXILIAR
   ========================================================================== */

/** Garantiza un slug único: "respaldo-sol", "respaldo-sol-2", ... */
async function uniqueSlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  base: string,
  excludeId?: string,
): Promise<string> {
  const clean = slugify(base) || 'pieza'
  let candidate = clean
  let suffix = 1

  for (let attempt = 0; attempt < 30; attempt += 1) {
    let query = supabase
      .from('products')
      .select('id')
      .eq('slug', candidate)
      .is('deleted_at', null)

    if (excludeId) query = query.neq('id', excludeId)

    const { data } = await query.maybeSingle()
    if (!data) return candidate

    suffix += 1
    candidate = `${clean}-${suffix}`
  }

  return `${clean}-${Date.now()}`
}
