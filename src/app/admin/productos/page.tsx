import Image from 'next/image'
import Link from 'next/link'
import { Package, Plus, Search } from 'lucide-react'
import { AdminHeader } from '@/components/admin/admin-nav'
import { Badge, EmptyState } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { storageUrl } from '@/lib/images'
import { PRODUCT_STATUS_LABEL } from '@/lib/labels'
import { getAdminCategories, getAdminProducts } from '@/lib/queries/admin'
import { formatPrice } from '@/lib/utils'

export const metadata = { title: 'Productos' }

const STATUS_FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'published', label: 'Publicados' },
  { key: 'draft', label: 'Borradores' },
  { key: 'archived', label: 'Archivados' },
] as const

export default async function AdminProductosPage({
  searchParams,
}: PageProps<'/admin/productos'>) {
  const params = await searchParams
  const read = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

  const status = (read('estado') ?? 'all') as 'all' | 'draft' | 'published' | 'archived'
  const search = read('buscar') ?? ''
  const categoryId = read('categoría')

  const [products, categories] = await Promise.all([
    getAdminProducts({ status, search, categoryId }),
    getAdminCategories(),
  ])

  return (
    <div className="p-4 md:p-8">
      <AdminHeader
        title="Productos"
        description={`${products.length} ${products.length === 1 ? 'pieza' : 'piezas'}`}
        action={
          <Button asChild>
            <Link href="/admin/productos/nuevo">
              <Plus />
              Nueva pieza
            </Link>
          </Button>
        }
      />

      <form className="relative mb-4" role="search">
        {status !== 'all' && <input type="hidden" name="estado" value={status} />}
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-linen-400"
          aria-hidden="true"
        />
        <input
          type="search"
          name="buscar"
          defaultValue={search}
          placeholder="Buscar una pieza"
          aria-label="Buscar productos"
          className="h-11 w-full rounded-lg border border-border-soft bg-surface pl-11 pr-3 text-[0.9375rem] focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-clay-500/25"
        />
      </form>

      <div className="scrollbar-none mb-5 flex gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map((filter) => (
          <Link
            key={filter.key}
            href={
              filter.key === 'all'
                ? '/admin/productos'
                : `/admin/productos?estado=${filter.key}`
            }
            aria-current={status === filter.key ? 'page' : undefined}
            className={`shrink-0 rounded-full border px-3.5 py-2 text-sm transition-colors ${
              status === filter.key
                ? 'border-clay-300 bg-primary-soft font-medium text-clay-700'
                : 'border-border-soft bg-surface text-ink-muted hover:border-border-strong'
            }`}
          >
            {filter.label}
          </Link>
        ))}

        {categories.length > 0 && (
          <>
            <span className="w-px shrink-0 bg-border-soft" aria-hidden="true" />
            {categories.slice(0, 6).map((category) => (
              <Link
                key={category.id}
                href={`/admin/productos?categoria=${category.id}`}
                aria-current={categoryId === category.id ? 'page' : undefined}
                className={`shrink-0 rounded-full border px-3.5 py-2 text-sm transition-colors ${
                  categoryId === category.id
                    ? 'border-clay-300 bg-primary-soft font-medium text-clay-700'
                    : 'border-border-soft bg-surface text-ink-muted hover:border-border-strong'
                }`}
              >
                {category.name}
              </Link>
            ))}
          </>
        )}
      </div>

      {products.length === 0 ? (
        <EmptyState
          icon={<Package className="size-10" strokeWidth={1.3} />}
          title={search ? 'No encontramos esa pieza' : 'Todavía no cargaste ninguna pieza'}
          description="Cargar una pieza lleva unos minutos: información, fotos, precio y listo."
          action={
            <Button asChild>
              <Link href="/admin/productos/nuevo">
                <Plus />
                Cargar la primera
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => {
            const cover = storageUrl(product.cover)
            const noStock =
              product.available_total === 0 && product.availability_mode !== 'made_to_order'

            return (
              <li key={product.id}>
                <Link
                  href={`/admin/productos/${product.id}`}
                  className="flex gap-3 rounded-xl border border-border-soft bg-surface p-3 transition-colors hover:border-clay-300"
                >
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-surface-muted">
                    {cover ? (
                      <Image
                        src={cover}
                        alt=""
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="grid h-full place-items-center text-linen-300">
                        <Package className="size-6" strokeWidth={1.3} />
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-medium text-ink">{product.name}</p>
                      <Badge
                        tone={
                          product.status === 'published'
                            ? 'success'
                            : product.status === 'draft'
                              ? 'neutral'
                              : 'warning'
                        }
                        size="sm"
                      >
                        {PRODUCT_STATUS_LABEL[product.status]}
                      </Badge>
                    </div>

                    <p className="truncate text-xs text-ink-subtle">
                      {product.category_name ?? 'Sin categoría'}
                      {product.variant_count > 1 &&
                        ` · ${product.variant_count} variantes`}
                    </p>

                    <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="tabular font-medium">
                        {formatPrice(product.base_price)}
                      </span>
                      <span
                        className={
                          noStock ? 'text-xs font-medium text-danger' : 'text-xs text-ink-muted'
                        }
                      >
                        {product.availability_mode === 'made_to_order'
                          ? 'A pedido'
                          : `${product.available_total} disponibles`}
                      </span>
                      {product.is_featured && (
                        <Badge tone="wood" size="sm">
                          Destacada
                        </Badge>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
