import Link from 'next/link'
import { ProductGrid } from '@/components/tienda/product-card'
import { Button } from '@/components/ui/button'
import { Overline, SectionHeading, ThreadDivider } from '@/components/ui/primitives'
import { COPY } from '@/lib/labels'
import { getFeaturedProducts, getNewProducts } from '@/lib/queries/catalog'

export const metadata = {
  title: 'Página no encontrada',
  robots: { index: false, follow: false },
}

/**
 * 404 dentro de la tienda: aparece cuando una ficha o una categoría ya no
 * existe. Como si tiene el layout, puede ofrecer piezas reales en lugar de
 * una pantalla vacía.
 */
export default async function TiendaNotFound() {
  const featured = await getFeaturedProducts(4)
  const fallback = featured.length > 0 ? featured : await getNewProducts(4)

  return (
    <div className="at-container py-16 md:py-24">
      <div className="mx-auto max-w-md space-y-4 text-center">
        <Overline>Error 404</Overline>
        <h1 className="text-display-lg">{COPY.notFound}</h1>
        <p className="text-ink-muted">
          Puede que esa pieza ya no esté publicada. Estas nos parecen lindas.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-1">
          <Button asChild>
            <Link href="/tienda">Ver la tienda</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/">{COPY.notFoundAction}</Link>
          </Button>
        </div>
      </div>

      {fallback.length > 0 && (
        <>
          <ThreadDivider className="my-14" />
          <SectionHeading overline="Mientras tanto" title="Piezas para mirar" />
          <ProductGrid products={fallback} priorityCount={0} />
        </>
      )}
    </div>
  )
}
