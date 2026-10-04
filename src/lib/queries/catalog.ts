import 'server-only'

import { cache } from 'react'
import { safeQuery } from '@/lib/queries/safe'
import { createPublicClient } from '@/lib/supabase/public'
import type {
  CatalogProduct,
  ProductAttribute,
  ProductAttributeValue,
  ProductMedia,
  Question,
  Review,
  VariantOptionValue,
  VariantView,
} from '@/types/database'

export type CatalogSort = 'novedades' | 'precio-asc' | 'precio-desc' | 'nombre' | 'mejor-valorados'

export type CatalogFilters = {
  categorySlug?: string
  search?: string
  minPrice?: number
  maxPrice?: number
  /** Solo piezas que se pueden comprar ahora */
  onlyAvailable?: boolean
  /** Solo las que tienen descuento */
  onlyOnSale?: boolean
  sort?: CatalogSort
  page?: number
  perPage?: number
}

export type CatalogPage = {
  products: CatalogProduct[]
  total: number
  page: number
  perPage: number
  totalPages: number
}

const DEFAULT_PER_PAGE = 24

/**
 * Consulta principal del catálogo.
 *
 * Lee de v_catalog_products, que ya trae precio final, disponibilidad, portada
 * y resumen de opciones en una sola fila. Sin esa vista harian falta cuatro
 * consultas por tarjeta.
 */
export async function getCatalog(filters: CatalogFilters = {}): Promise<CatalogPage> {
  const page = Math.max(1, filters.page ?? 1)
  const perPage = Math.min(filters.perPage ?? DEFAULT_PER_PAGE, 60)
  const from = (page - 1) * perPage

  return safeQuery(
    async () => {
      const supabase = createPublicClient()

      // La busqueda por texto tiene su propia función: usa el índice
      // full-text en espanol y tolera acentos y errores de tipeo.
      if (filters.search?.trim()) {
        const { data } = await supabase.rpc('search_products', {
          p_query: filters.search.trim(),
          p_limit: perPage,
        })
        const products = (data ?? []) as CatalogProduct[]
        return {
          products,
          total: products.length,
          page: 1,
          perPage,
          totalPages: 1,
        }
      }

      let query = supabase
        .from('v_catalog_products')
        .select('*', { count: 'exact' })
        .eq('status', 'published')

      if (filters.categorySlug) {
        query = query.eq('category_slug', filters.categorySlug)
      }
      if (filters.minPrice != null) {
        query = query.gte('final_price', filters.minPrice)
      }
      if (filters.maxPrice != null) {
        query = query.lte('final_price', filters.maxPrice)
      }
      if (filters.onlyOnSale) {
        query = query.gt('discount_amount', 0)
      }
      if (filters.onlyAvailable) {
        // "A pedido" también se puede comprar aunque el stock sea 0
        query = query.or('available_total.gt.0,availability_mode.eq.made_to_order')
      }

      switch (filters.sort) {
        case 'precio-asc':
          query = query.order('final_price', { ascending: true, nullsFirst: false })
          break
        case 'precio-desc':
          query = query.order('final_price', { ascending: false, nullsFirst: false })
          break
        case 'nombre':
          query = query.order('name', { ascending: true })
          break
        case 'mejor-valorados':
          query = query
            .order('rating_avg', { ascending: false })
            .order('rating_count', { ascending: false })
          break
        default:
          query = query.order('published_at', { ascending: false, nullsFirst: false })
      }

      const { data, count } = await query.range(from, from + perPage - 1)
      const total = count ?? 0

      return {
        products: (data ?? []) as CatalogProduct[],
        total,
        page,
        perPage,
        totalPages: Math.max(1, Math.ceil(total / perPage)),
      }
    },
    { products: [], total: 0, page, perPage, totalPages: 1 },
  )
}

export const getFeaturedProducts = cache(async (limit = 8): Promise<CatalogProduct[]> => {
  return safeQuery(async () => {
    const supabase = createPublicClient()
    const { data } = await supabase
      .from('v_catalog_products')
      .select('*')
      .eq('status', 'published')
      .eq('is_featured', true)
      .order('featured_position', { ascending: true })
      .limit(limit)

    return (data ?? []) as CatalogProduct[]
  }, [])
})

export const getNewProducts = cache(async (limit = 8): Promise<CatalogProduct[]> => {
  return safeQuery(async () => {
    const supabase = createPublicClient()
    const { data } = await supabase
      .from('v_catalog_products')
      .select('*')
      .eq('status', 'published')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limit)

    return (data ?? []) as CatalogProduct[]
  }, [])
})

/** Colección automática de ofertas (punto 109). */
export const getOnSaleProducts = cache(async (limit = 24): Promise<CatalogProduct[]> => {
  return safeQuery(async () => {
    const supabase = createPublicClient()
    const { data } = await supabase
      .from('v_catalog_products')
      .select('*')
      .eq('status', 'published')
      .gt('discount_amount', 0)
      .order('discount_percent', { ascending: false })
      .limit(limit)

    return (data ?? []) as CatalogProduct[]
  }, [])
})

/** Colección automática "últimas unidades" (punto 110). */
export const getLastUnitsProducts = cache(async (limit = 12): Promise<CatalogProduct[]> => {
  return safeQuery(async () => {
    const supabase = createPublicClient()
    const { data } = await supabase
      .from('v_catalog_products')
      .select('*')
      .eq('status', 'published')
      .neq('availability_mode', 'made_to_order')
      .gt('available_total', 0)
      .lte('available_total', 3)
      .order('available_total', { ascending: true })
      .limit(limit)

    return (data ?? []) as CatalogProduct[]
  }, [])
})

/* =============================================================================
   FICHA DE PRODUCTO
   ========================================================================== */

export type ProductDetail = {
  product: CatalogProduct
  variants: VariantView[]
  attributes: Array<ProductAttribute & { values: ProductAttributeValue[] }>
  /** variant_id -> { attribute_id: value_id } */
  combinations: Record<string, Record<string, string>>
  media: ProductMedia[]
  description: string | null
}

export const getProductBySlug = cache(
  async (slug: string): Promise<ProductDetail | null> => {
    return safeQuery(async () => {
      const supabase = createPublicClient()

      const { data: product } = await supabase
        .from('v_catalog_products')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle()

      if (!product) return null
      const p = product as CatalogProduct

      // La descripción larga no está en la vista (no la necesita ninguna
      // tarjeta); se pide aparte solo en la ficha.
      const [descRes, variantsRes, attrsRes, valuesRes, comboRes, mediaRes] =
        await Promise.all([
          supabase.from('products').select('description').eq('id', p.id).maybeSingle(),
          supabase
            .from('v_product_variants')
            .select('*')
            .eq('product_id', p.id)
            .eq('is_active', true)
            .order('position', { ascending: true }),
          supabase
            .from('product_attributes')
            .select('*')
            .eq('product_id', p.id)
            .order('position', { ascending: true }),
          supabase
            .from('product_attribute_values')
            .select('*, product_attributes!inner(product_id)')
            .eq('product_attributes.product_id', p.id)
            .order('position', { ascending: true }),
          supabase
            .from('variant_option_values')
            .select('*, product_variants!inner(product_id)')
            .eq('product_variants.product_id', p.id),
          supabase
            .from('product_media')
            .select('*')
            .eq('product_id', p.id)
            .order('is_cover', { ascending: false })
            .order('position', { ascending: true }),
        ])

      const values = (valuesRes.data ?? []) as ProductAttributeValue[]
      const attributes = ((attrsRes.data ?? []) as ProductAttribute[]).map((attr) => ({
        ...attr,
        values: values.filter((v) => v.attribute_id === attr.id),
      }))

      const combinations: Record<string, Record<string, string>> = {}
      for (const row of (comboRes.data ?? []) as VariantOptionValue[]) {
        combinations[row.variant_id] ??= {}
        combinations[row.variant_id][row.attribute_id] = row.value_id
      }

      return {
        product: p,
        variants: (variantsRes.data ?? []) as VariantView[],
        attributes,
        combinations,
        media: (mediaRes.data ?? []) as ProductMedia[],
        description: descRes.data?.description ?? null,
      }
    }, null)
  },
)

/** Slugs publicados, para generar las rutas estáticas del catálogo. */
export async function getPublishedSlugs(): Promise<Array<{ slug: string; updated: string }>> {
  return safeQuery(async () => {
    const supabase = createPublicClient()
    const { data } = await supabase
      .from('products')
      .select('slug, updated_at')
      .eq('status', 'published')
      .is('deleted_at', null)
      .limit(2000)

    return (data ?? []).map((p) => ({ slug: p.slug!, updated: p.updated_at! }))
  }, [])
}

/** Piezas relacionadas: misma categoría, excluyendo la actual. */
export async function getRelatedProducts(
  productId: string,
  categoryId: string | null,
  limit = 4,
): Promise<CatalogProduct[]> {
  if (!categoryId) return []
  return safeQuery(async () => {
    const supabase = createPublicClient()
    const { data } = await supabase
      .from('v_catalog_products')
      .select('*')
      .eq('status', 'published')
      .eq('category_id', categoryId)
      .neq('id', productId)
      .limit(limit)

    return (data ?? []) as CatalogProduct[]
  }, [])
}

/* =============================================================================
   PREGUNTAS Y RESENAS
   RLS ya filtra: publicas + las propias. Está consulta no tiene que saberlo.
   ========================================================================== */

export async function getProductQuestions(productId: string): Promise<Question[]> {
  return safeQuery(async () => {
    const supabase = createPublicClient()
    const { data } = await supabase
      .from('questions')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(20)

    return (data ?? []) as Question[]
  }, [])
}

export async function getProductReviews(
  productId: string,
): Promise<Array<Review & { author: string }>> {
  return safeQuery(async () => {
    const supabase = createPublicClient()
    const { data } = await supabase
      .from('reviews')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(20)

    // El nombre viene congelado en la propia fila: RLS solo deja ver el perfil
    // propio, así que un JOIN con profiles devolvería null para las reseñas de
    // otras personas.
    return ((data ?? []) as Review[]).map((review) => ({
      ...review,
      // Solo el nombre de pila: no hace falta exponer más.
      author: review.author_name?.trim().split(' ')[0] || 'Cliente',
    }))
  }, [])
}
