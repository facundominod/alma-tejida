import type { Metadata } from 'next'
import Link from 'next/link'
import { Tag } from 'lucide-react'
import { ProductGrid } from '@/components/tienda/product-card'
import { PromoCarousel } from '@/components/tienda/promo-carousel'
import { Button } from '@/components/ui/button'
import { EmptyState, Overline } from '@/components/ui/primitives'
import { COPY } from '@/lib/labels'
import { getOnSaleProducts } from '@/lib/queries/catalog'
import { getActivePromotions } from '@/lib/queries/store'

export const metadata: Metadata = {
  title: 'Ofertas',
  description: 'Piezas con descuento en Alma Tejida. Promociones vigentes, sin letra chica.',
  alternates: { canonical: '/ofertas' },
}

// Más corta que el resto del catálogo: una promoción que vence tiene que
// desaparecer rápido, no quedar colgada media hora.
export const revalidate = 60

export default async function OfertasPage() {
  const [products, promotions] = await Promise.all([
    getOnSaleProducts(48),
    getActivePromotions(),
  ])

  return (
    <div className="py-8 md:py-12">
      <div className="at-container mb-8 space-y-2">
        <Overline>Precios especiales</Overline>
        <h1 className="text-display-lg">Ofertas</h1>
        <p className="text-ink-muted">
          Lo que está con descuento ahora mismo. Cuando la promoción termina, sale de acá.
        </p>
      </div>

      {promotions.length > 0 && (
        <div className="mb-12">
          <PromoCarousel promotions={promotions} />
        </div>
      )}

      <div className="at-container">
        {products.length > 0 ? (
          <ProductGrid products={products} priorityCount={4} />
        ) : (
          <EmptyState
            icon={<Tag className="size-10" strokeWidth={1.3} />}
            title={COPY.emptyOffers}
            description={COPY.emptyOffersHint}
            action={
              <Button asChild variant="secondary">
                <Link href="/tienda">Ver toda la tienda</Link>
              </Button>
            }
          />
        )}
      </div>
    </div>
  )
}
