import 'server-only'

import { createClient, requireAdmin } from '@/lib/supabase/server'
import type {
  Category,
  DashboardMetrics,
  FunnelMetrics,
  LowStockRow,
  Notification,
  Order,
  OrderItem,
  OrderStatus,
  OrderStatusHistory,
  PaymentProof,
  Product,
  Promotion,
  Question,
  Review,
  StorageUsage,
} from '@/types/database'

/**
 * Lecturas del panel.
 *
 * Todas empiezan por requireAdmin(), que verifica el rol CONTRA LA BASE. No
 * alcanza con que el middleware haya dejado pasar: si alguien llegara hasta
 * acá de otra forma, esto lanza antes de leer nada.
 *
 * Ademas, las funciones SQL que usan (admin_dashboard, admin_low_stock, ...)
 * vuelven a comprobar is_admin() del lado de la base. Dos verificaciones
 * independientes, en dos capas distintas.
 */

export async function getDashboard(from?: string, to?: string): Promise<DashboardMetrics> {
  await requireAdmin()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('admin_dashboard', {
    p_from: from ?? null,
    p_to: to ?? null,
  })

  if (error || !data) throw new Error('No pudimos cargar el panel.')
  return data as unknown as DashboardMetrics
}

export async function getSalesByDay(from: string, to: string) {
  await requireAdmin()
  const supabase = await createClient()
  const { data } = await supabase.rpc('admin_sales_by_day', { p_from: from, p_to: to })
  return (data ?? []) as Array<{
    day: string
    orders_count: number
    sales_count: number
    revenue: number
  }>
}

export async function getTopProducts(
  from: string,
  to: string,
  by: 'units' | 'amount' = 'units',
  limit = 8,
) {
  await requireAdmin()
  const supabase = await createClient()
  const { data } = await supabase.rpc('admin_top_products', {
    p_from: from,
    p_to: to,
    p_by: by,
    p_limit: limit,
  })
  return (data ?? []) as Array<{
    product_id: string
    name: string
    slug: string
    image_url: string | null
    units: number
    amount: number
  }>
}

export async function getTopViewed(from: string, to: string, limit = 8) {
  await requireAdmin()
  const supabase = await createClient()
  const { data } = await supabase.rpc('admin_top_viewed', {
    p_from: from,
    p_to: to,
    p_limit: limit,
  })
  return (data ?? []) as Array<{
    product_id: string
    name: string
    slug: string
    views: number
  }>
}

export async function getFunnel(from: string, to: string): Promise<FunnelMetrics> {
  await requireAdmin()
  const supabase = await createClient()
  const { data } = await supabase.rpc('admin_funnel', { p_from: from, p_to: to })
  return (data as unknown as FunnelMetrics) ?? {
    product_views: 0,
    add_to_cart: 0,
    checkout_started: 0,
    orders: 0,
    paid: 0,
    view_to_cart: 0,
    cart_to_order: 0,
    order_to_paid: 0,
  }
}

export async function getLowStock(limit = 50): Promise<LowStockRow[]> {
  await requireAdmin()
  const supabase = await createClient()
  const { data } = await supabase.rpc('admin_low_stock', { p_limit: limit })
  return (data ?? []) as LowStockRow[]
}

export async function getStorageUsage(): Promise<StorageUsage | null> {
  await requireAdmin()
  const supabase = await createClient()
  const { data } = await supabase.rpc('storage_usage')
  return (data as unknown as StorageUsage) ?? null
}

/* =============================================================================
   PEDIDOS
   ========================================================================== */

export type AdminOrderRow = Order & { item_count: number }

export async function getOrders(filters: {
  status?: OrderStatus | 'all'
  search?: string
  page?: number
  perPage?: number
}) {
  await requireAdmin()
  const supabase = await createClient()

  const page = Math.max(1, filters.page ?? 1)
  const perPage = filters.perPage ?? 30
  const from = (page - 1) * perPage

  // `.returns<T>()` es el escape tipado de supabase-js para los embeds: los
  // tipos de este proyecto están escritos a mano y no declaran relaciones.
  // Cuando se generen desde el esquema real, esto se puede quitar.
  type OrderWithCount = Order & { order_items: Array<{ count: number }> }

  let query = supabase
    .from('orders')
    .select('*, order_items(count)', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }

  if (filters.search?.trim()) {
    const term = filters.search.trim()
    query = query.or(
      `order_number.ilike.%${term}%,customer_name.ilike.%${term}%,customer_email.ilike.%${term}%,customer_phone.ilike.%${term}%`,
    )
  }

  // `.returns<T>()` va al final de la cadena: devuelve un builder de
  // transformación, que ya no acepta filtros.
  const { data, count } = await query
    .range(from, from + perPage - 1)
    .returns<OrderWithCount[]>()

  const orders = (data ?? []).map((order) => ({
    ...order,
    item_count: order.order_items?.[0]?.count ?? 0,
  }))

  return {
    orders: orders as AdminOrderRow[],
    total: count ?? 0,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / perPage)),
  }
}

/** Cuantos pedidos hay en cada estado, para los chips de la barra superior. */
export async function getOrderCounts(): Promise<Record<string, number>> {
  await requireAdmin()
  const supabase = await createClient()
  const { data } = await supabase.from('orders').select('status')

  const counts: Record<string, number> = { all: 0 }
  for (const row of (data ?? []) as Array<{ status: OrderStatus }>) {
    counts.all += 1
    counts[row.status] = (counts[row.status] ?? 0) + 1
  }
  return counts
}

export async function getOrderDetail(orderId: string) {
  await requireAdmin()
  const supabase = await createClient()

  const [orderRes, itemsRes, historyRes, proofsRes] = await Promise.all([
    supabase.from('orders').select('*').eq('id', orderId).maybeSingle(),
    supabase.from('order_items').select('*').eq('order_id', orderId).order('created_at'),
    supabase
      .from('order_status_history')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false }),
    supabase
      .from('payment_proofs')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false }),
  ])

  if (!orderRes.data) return null

  return {
    order: orderRes.data as Order,
    items: (itemsRes.data ?? []) as OrderItem[],
    history: (historyRes.data ?? []) as OrderStatusHistory[],
    proofs: (proofsRes.data ?? []) as PaymentProof[],
  }
}

/* =============================================================================
   PRODUCTOS
   ========================================================================== */

export type AdminProductRow = Product & {
  category_name: string | null
  available_total: number
  variant_count: number
  cover: string | null
}

export async function getAdminProducts(filters: {
  status?: 'all' | 'draft' | 'published' | 'archived'
  search?: string
  categoryId?: string
}) {
  await requireAdmin()
  const supabase = await createClient()

  type Raw = Product & {
    categories: { name: string } | null
    product_variants: Array<{ stock: number; reserved: number; is_active: boolean }>
    product_media: Array<{
      storage_path: string
      thumb_path: string | null
      is_cover: boolean
      type: string
    }>
  }

  let query = supabase
    .from('products')
    .select(
      `*,
       categories(name),
       product_variants(stock, reserved, is_active),
       product_media(storage_path, thumb_path, is_cover, type)`,
    )
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(200)

  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
  if (filters.search?.trim()) query = query.ilike('name', `%${filters.search.trim()}%`)

  const { data } = await query.returns<Raw[]>()

  return (data ?? []).map((product) => {
    const variants = product.product_variants ?? []
    const cover =
      product.product_media?.find((m) => m.is_cover && m.type === 'image') ??
      product.product_media?.find((m) => m.type === 'image')

    return {
      ...product,
      category_name: product.categories?.name ?? null,
      variant_count: variants.filter((v) => v.is_active).length,
      available_total: variants
        .filter((v) => v.is_active)
        .reduce((sum, v) => sum + Math.max(v.stock - v.reserved, 0), 0),
      cover: cover?.thumb_path ?? cover?.storage_path ?? null,
    } as AdminProductRow
  })
}

/** Producto completo para el editor: atributos, valores, variantes y media. */
export async function getAdminProduct(productId: string) {
  await requireAdmin()
  const supabase = await createClient()

  const [productRes, attrsRes, valuesRes, variantsRes, comboRes, mediaRes] =
    await Promise.all([
      supabase.from('products').select('*').eq('id', productId).maybeSingle(),
      supabase
        .from('product_attributes')
        .select('*')
        .eq('product_id', productId)
        .order('position'),
      supabase
        .from('product_attribute_values')
        .select('*, product_attributes!inner(product_id)')
        .eq('product_attributes.product_id', productId)
        .order('position'),
      supabase
        .from('product_variants')
        .select('*')
        .eq('product_id', productId)
        .order('position'),
      supabase
        .from('variant_option_values')
        .select('*, product_variants!inner(product_id)')
        .eq('product_variants.product_id', productId),
      supabase
        .from('product_media')
        .select('*')
        .eq('product_id', productId)
        .order('position'),
    ])

  if (!productRes.data) return null

  return {
    product: productRes.data as Product,
    attributes: (attrsRes.data ?? []) as Array<{
      id: string
      name: string
      type: string
      position: number
    }>,
    values: (valuesRes.data ?? []) as Array<{
      id: string
      attribute_id: string
      value: string
      color_hex: string | null
      position: number
    }>,
    variants: (variantsRes.data ?? []) as Array<{
      id: string
      sku: string | null
      price_override: number | null
      stock: number
      reserved: number
      is_default: boolean
      is_active: boolean
      position: number
    }>,
    combinations: (comboRes.data ?? []) as Array<{
      variant_id: string
      attribute_id: string
      value_id: string
    }>,
    media: (mediaRes.data ?? []) as Array<{
      id: string
      type: string
      storage_path: string
      thumb_path: string | null
      alt: string | null
      position: number
      is_cover: boolean
      variant_id: string | null
      attribute_value_id: string | null
      size_bytes: number | null
    }>,
  }
}

export async function getAdminCategories(): Promise<Category[]> {
  await requireAdmin()
  const supabase = await createClient()
  const { data } = await supabase
    .from('categories')
    .select('*')
    .is('deleted_at', null)
    .order('position')
  return (data ?? []) as Category[]
}

export async function getAdminPromotions(): Promise<
  Array<Promotion & { target_count: number; is_current: boolean }>
> {
  await requireAdmin()
  const supabase = await createClient()
  const { data } = await supabase
    .from('promotions')
    .select('*, promotion_targets(count)')
    .order('position')
    .returns<Array<Promotion & { promotion_targets: Array<{ count: number }> }>>()

  // "Vigente" se resuelve acá y no en el navegador: leer el reloj durante el
  // render de un componente cliente lo vuelve no idempotente.
  const now = Date.now()

  return (data ?? []).map((promo) => ({
    ...promo,
    target_count: promo.promotion_targets?.[0]?.count ?? 0,
    is_current:
      promo.is_active &&
      (!promo.starts_at || new Date(promo.starts_at).getTime() <= now) &&
      (!promo.ends_at || new Date(promo.ends_at).getTime() >= now),
  }))
}

/* =============================================================================
   MODERACION
   ========================================================================== */

export async function getAdminQuestions(onlyPending = false) {
  await requireAdmin()
  const supabase = await createClient()

  let query = supabase
    .from('questions')
    .select('*, products(name, slug)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (onlyPending) query = query.eq('status', 'pending')

  const { data } = await query.returns<
    Array<Question & { products: { name: string; slug: string } | null }>
  >()
  return data ?? []
}

export async function getAdminReviews(onlyPending = false) {
  await requireAdmin()
  const supabase = await createClient()

  let query = supabase
    .from('reviews')
    .select('*, products(name, slug)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (onlyPending) query = query.eq('status', 'pending')

  const { data } = await query.returns<
    Array<Review & { products: { name: string; slug: string } | null }>
  >()
  return data ?? []
}

export async function getAdminNotifications(limit = 50): Promise<Notification[]> {
  await requireAdmin()
  const supabase = await createClient()
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('audience', 'admin')
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []) as Notification[]
}

export async function getUnreadCount(): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('audience', 'admin')
    .is('read_at', null)

  return count ?? 0
}

/* =============================================================================
   MARGENES
   ========================================================================== */

export type MargenPorPieza = {
  product_id: string
  nombre: string
  unidades: number
  ingresos: number
  costos: number
  ganancia: number
  /** Nulo cuando falta cargar el costo: un 100% inventado es peor que nada. */
  margen: number | null
}

export type Margenes = {
  resumen: {
    unidades: number
    ingresos: number
    costos: number
    ganancia: number
    margen: number | null
  }
  piezas: MargenPorPieza[]
}

/**
 * Cuánto se vendió y cuánto quedó, en un rango.
 *
 * Sólo cuenta pedidos COBRADOS: uno pendiente todavía no es una ganancia, y
 * mezclarlos daría un número que se desinfla solo cuando alguien no transfiere.
 *
 * La función de la base comprueba `is_admin()` por su cuenta y lanza si no.
 * El costo es información de adentro y no sale por ninguna otra vía.
 */
export async function getMargenes(desde: string, hasta: string): Promise<Margenes> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('admin_margenes', {
    p_desde: desde,
    p_hasta: hasta,
  })

  if (error || !data) {
    return {
      resumen: { unidades: 0, ingresos: 0, costos: 0, ganancia: 0, margen: null },
      piezas: [],
    }
  }

  return data as unknown as Margenes
}
