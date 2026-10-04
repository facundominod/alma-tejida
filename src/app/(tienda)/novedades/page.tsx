import type { Metadata } from 'next'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { ProductGrid } from '@/components/tienda/product-card'
import { Button } from '@/components/ui/button'
import { EmptyState, Overline } from '@/components/ui/primitives'
import { getNewProducts } from '@/lib/queries/catalog'

export const metadata: Metadata = {
  title: 'Novedades',
  description: 'Las últimas piezas que salieron del telar de Alma Tejida.',
  alternates: { canonical: '/novedades' },
}

export const revalidate = 300

export default async function NovedadesPage() {
  const products = await getNewProducts(24)

  return (
    <div className="at-container py-8 md:py-12">
      <header className="mb-8 space-y-2">
        <Overline>Recien salidas del telar</Overline>
        <h1 className="text-display-lg">Novedades</h1>
        <p className="text-ink-muted">Lo último que terminamos, en orden de llegada.</p>
      </header>

      {products.length > 0 ? (
        <ProductGrid products={products} priorityCount={4} />
      ) : (
        <EmptyState
          icon={<Sparkles className="size-10" strokeWidth={1.3} />}
          title="Todavía no hay piezas publicadas"
          action={
            <Button asChild variant="secondary">
              <Link href="/">Volver al inicio</Link>
            </Button>
          }
        />
      )}
    </div>
  )
}
