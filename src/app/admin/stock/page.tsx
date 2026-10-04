import { AdminHeader } from '@/components/admin/admin-nav'
import { StockBoard } from '@/components/admin/stock-board'
import { createClient, requireAdmin } from '@/lib/supabase/server'

export const metadata = { title: 'Stock' }

export type StockRow = {
  variant_id: string
  product_id: string
  product_name: string
  product_slug: string
  variant_label: string | null
  sku: string | null
  stock: number
  reserved: number
  available: number
  threshold: number
  image: string | null
  status: string
}

/**
 * Carga de stock (puntos 57, 58, 130, 131).
 *
 * Es la pantalla que el administrador va a abrir más veces en su vida, casi
 * siempre desde el celular y con una mano. Por eso arranca ordenada por lo
 * que menos queda: lo urgente aparece primero, sin buscar.
 */
export default async function StockPage({ searchParams }: PageProps<'/admin/stock'>) {
  await requireAdmin()
  const params = await searchParams
  const search = Array.isArray(params.buscar) ? params.buscar[0] : params.buscar

  const supabase = await createClient()

  const { data } = await supabase
    .from('product_variants')
    .select(
      `id, sku, stock, reserved, low_stock_threshold, is_active,
       products!inner(id, name, slug, status, deleted_at, low_stock_threshold,
                      product_media(storage_path, thumb_path, is_cover, type))`,
    )
    .eq('is_active', true)
    .limit(400)

  type Raw = {
    id: string
    sku: string | null
    stock: number
    reserved: number
    low_stock_threshold: number | null
    products: {
      id: string
      name: string
      slug: string
      status: string
      deleted_at: string | null
      low_stock_threshold: number
      product_media: Array<{
        storage_path: string
        thumb_path: string | null
        is_cover: boolean
        type: string
      }>
    }
  }

  // Las etiquetas de variante se resuelven con la misma función que usa la
  // tienda: una sola definición de "Crudo · 1,50 x 2,00".
  const rows = (data ?? []) as unknown as Raw[]
  const labels = await Promise.all(
    rows.map(async (row) => {
      const { data: label } = await supabase.rpc('variant_label', { p_variant_id: row.id })
      return [row.id, label as string | null] as const
    }),
  )
  const labelMap = new Map(labels)

  const stockRows: StockRow[] = rows
    .filter((row) => row.products && !row.products.deleted_at)
    .map((row) => {
      const cover =
        row.products.product_media?.find((m) => m.is_cover && m.type === 'image') ??
        row.products.product_media?.find((m) => m.type === 'image')

      return {
        variant_id: row.id,
        product_id: row.products.id,
        product_name: row.products.name,
        product_slug: row.products.slug,
        variant_label: labelMap.get(row.id) ?? null,
        sku: row.sku,
        stock: row.stock,
        reserved: row.reserved,
        available: Math.max(row.stock - row.reserved, 0),
        threshold: row.low_stock_threshold ?? row.products.low_stock_threshold,
        image: cover?.thumb_path ?? cover?.storage_path ?? null,
        status: row.products.status,
      }
    })
    .filter((row) =>
      search
        ? `${row.product_name} ${row.variant_label ?? ''} ${row.sku ?? ''}`
            .toLowerCase()
            .includes(search.toLowerCase())
        : true,
    )
    // Lo que menos queda, primero
    .sort((a, b) => a.available - b.available || a.product_name.localeCompare(b.product_name))

  return (
    <div className="p-4 md:p-8">
      <AdminHeader
        title="Stock"
        description="Un toque = un movimiento registrado. Nada cambia sin dejar rastro."
      />
      <StockBoard rows={stockRows} initialSearch={search ?? ''} />
    </div>
  )
}
