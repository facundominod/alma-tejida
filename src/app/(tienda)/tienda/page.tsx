import type { Metadata } from 'next'
import Link from 'next/link'
import { PackageSearch } from 'lucide-react'
import { CatalogFilters } from '@/components/tienda/catalog-filters'
import { ProductGrid } from '@/components/tienda/product-card'
import { Button } from '@/components/ui/button'
import { EmptyState, Overline } from '@/components/ui/primitives'
import { COPY } from '@/lib/labels'
import { getCatalog, type CatalogSort } from '@/lib/queries/catalog'
import { getTopCategories } from '@/lib/queries/store'

export const metadata: Metadata = {
  title: 'Tienda',
  description:
    'Todas las piezas de Alma Tejida: mantas, almohadones, gorros y decoración tejida a mano.',
}

// El catálogo se cachea por combinación de filtros. Al publicar o cambiar un
// producto, la Server Action inválida el tag y se regenera.
export const revalidate = 300

const VALID_SORTS: CatalogSort[] = [
  'novedades',
  'precio-asc',
  'precio-desc',
  'nombre',
  'mejor-valorados',
]

export default async function TiendaPage({ searchParams }: PageProps<'/tienda'>) {
  const params = await searchParams

  const readOne = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

  const search = readOne('buscar')?.trim() || undefined
  const sortParam = readOne('orden') as CatalogSort | undefined
  const page = Number(readOne('página') ?? '1') || 1

  // Hay filtro activo? Determina que mensaje mostrar cuando no hay resultados.
  const hasFilters = Boolean(
    readOne('categoria') ||
      readOne('min') ||
      readOne('max') ||
      readOne('disponibles') === '1' ||
      readOne('oferta') === '1',
  )

  const [{ products, total, totalPages }, categories] = await Promise.all([
    getCatalog({
      categorySlug: readOne('categoría') || undefined,
      search,
      minPrice: readOne('min') ? Number(readOne('min')) : undefined,
      maxPrice: readOne('max') ? Number(readOne('max')) : undefined,
      onlyAvailable: readOne('disponibles') === '1',
      onlyOnSale: readOne('oferta') === '1',
      sort: sortParam && VALID_SORTS.includes(sortParam) ? sortParam : 'novedades',
      page,
    }),
    getTopCategories(),
  ])

  return (
    <div className="at-container py-8 md:py-12">
      <header className="mb-8 space-y-2">
        <Overline>Catálogo</Overline>
        <h1 className="text-display-lg">
          {search ? `Resultados para "${search}"` : 'Todas las piezas'}
        </h1>
        <p className="text-ink-muted">
          Cada una hecha a mano. Pueden existir pequeñas diferencias de color y medida.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[260px_1fr] lg:gap-12">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <CatalogFilters categories={categories} total={total} />
        </div>

        <div>
          <p className="mb-5 hidden text-sm text-ink-muted lg:block">
            <span className="tabular font-medium text-ink">{total}</span>{' '}
            {total === 1 ? 'pieza' : 'piezas'}
          </p>

          {products.length > 0 ? (
            <>
              <ProductGrid products={products} priorityCount={4} />

              {totalPages > 1 && (
                <Pagination page={page} totalPages={totalPages} params={params} />
              )}
            </>
          ) : (
            /* Tres situaciones distintas que antes decían todas lo mismo:
               una búsqueda sin resultados, un filtro sin resultados, y un
               catálogo que todavía está vacío. Decirle "no encontramos piezas
               con ese filtro" a alguien que no filtró nada es confuso. */
            <EmptyState
              icon={<PackageSearch className="size-10" strokeWidth={1.3} />}
              title={
                search
                  ? COPY.emptySearch(search)
                  : hasFilters
                    ? COPY.emptyCatalog
                    : 'Todavía no hay piezas publicadas'
              }
              description={
                search || hasFilters
                  ? 'Probá con otras palabras o mirá todo el catálogo.'
                  : 'En cuanto se carguen las primeras, van a aparecer acá.'
              }
              action={
                search || hasFilters ? (
                  <Button asChild variant="secondary">
                    <Link href="/tienda">{COPY.emptyCatalogAction}</Link>
                  </Button>
                ) : (
                  <Button asChild variant="secondary">
                    <Link href="/contacto">Escribinos</Link>
                  </Button>
                )
              }
            />
          )}
        </div>
      </div>
    </div>
  )
}

function Pagination({
  page,
  totalPages,
  params,
}: {
  page: number
  totalPages: number
  params: Record<string, string | string[] | undefined>
}) {
  const buildHref = (target: number) => {
    const next = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (key === 'página' || value == null) continue
      next.set(key, Array.isArray(value) ? value[0] : value)
    }
    if (target > 1) next.set('página', String(target))
    return next.toString() ? `/tienda?${next.toString()}` : '/tienda'
  }

  return (
    <nav className="mt-12 flex items-center justify-center gap-2" aria-label="Paginación">
      {page > 1 && (
        <Button asChild variant="secondary" size="sm">
          <Link href={buildHref(page - 1)} rel="prev">
            Anterior
          </Link>
        </Button>
      )}
      <span className="tabular px-3 text-sm text-ink-muted">
        Página {page} de {totalPages}
      </span>
      {page < totalPages && (
        <Button asChild variant="secondary" size="sm">
          <Link href={buildHref(page + 1)} rel="next">
            Siguiente
          </Link>
        </Button>
      )}
    </nav>
  )
}
