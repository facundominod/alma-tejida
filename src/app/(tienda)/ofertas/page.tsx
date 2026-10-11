import type { Metadata } from 'next'
import Link from 'next/link'
import { Tag } from 'lucide-react'
import { ProductGrid } from '@/components/tienda/product-card'
import { CuentaRegresiva } from '@/components/tienda/cuenta-regresiva'
import { PromoCarousel } from '@/components/tienda/promo-carousel'
import { Button } from '@/components/ui/button'
import { EmptyState, Overline } from '@/components/ui/primitives'
import { COPY } from '@/lib/labels'
import { getOnSaleProducts } from '@/lib/queries/catalog'
import { getActivePromotions } from '@/lib/queries/store'
import { formatPrice } from '@/lib/utils'

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

  /**
   * La plata que más se ahorra en toda la página, y la promoción que vence
   * primero.
   *
   * El ahorro va en PESOS y no en porcentaje: "20 %" obliga a hacer una cuenta
   * para saber si conviene; "$43.000" ya es la respuesta.
   *
   * El reloj va UNA sola vez, arriba, y es el de la promoción más próxima a
   * terminar. Uno por tarjeta sería un tablero de aeropuerto.
   */
  const ahorroMaximo = products.reduce(
    (mayor, p) => Math.max(mayor, Math.round(Number(p.discount_amount ?? 0))),
    0,
  )

  const cortes = promotions
    .map((p) => p.ends_at)
    .filter((f): f is string => Boolean(f))
    .sort()
  const corteProximo = cortes[0] ?? null

  return (
    <div className="py-8 md:py-12">
      {/* CABECERA A SANGRE, CON TEXTURA.
          No es el catálogo con otro título: es un pliego de precios tachados.
          El ahorro más grande va en un bloque oscuro —el único pleno de la
          página— porque la cifra en pesos es lo que decide, no el porcentaje.

          Cero rojo de liquidación: una pieza de $230.000 sobre fondo rojo de
          saldo se lee como saldo, y eso le cuesta más de lo que le rinde. */}
      <section className="at-weave mb-10 border-y border-border-soft bg-linen-100">
        <div className="at-container py-10 md:grid md:grid-cols-[1fr_auto] md:items-end md:gap-10 md:py-14">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Overline>Lo que está tachado hoy</Overline>
              {corteProximo && (
                <CuentaRegresiva
                  termina={corteProximo}
                  className="bg-sale/12 text-sale"
                />
              )}
            </div>
            <h1 className="text-display-lg">Precios tachados</h1>
            <p className="max-w-xl text-ink-muted">
              {products.length > 0
                ? `${products.length} ${products.length === 1 ? 'pieza' : 'piezas'} con el precio de lista cruzado. Cuando la promoción se termina, el hilo se va y el número vuelve al de siempre.`
                : 'Cuando haya una promoción activa, las piezas rebajadas aparecen acá con el precio de lista tachado.'}
            </p>
            <p className="max-w-xl text-sm text-ink-subtle">
              Y si pagás por transferencia o efectivo, baja otro 20 % sobre el precio ya
              rebajado.
            </p>
          </div>

          {ahorroMaximo > 0 && (
            <div className="mt-6 rounded-xl bg-linen-900 px-5 py-4 text-center md:mt-0">
              <p className="text-xs uppercase tracking-[0.12em] text-white/60">
                Se ahorra hasta
              </p>
              <p className="tabular font-display text-3xl text-white md:text-4xl">
                {formatPrice(ahorroMaximo)}
              </p>
            </div>
          )}
        </div>
      </section>

      {promotions.length > 0 && (
        <div className="mb-12">
          <PromoCarousel promotions={promotions} />
        </div>
      )}

      <div className="at-container">
        {products.length > 0 ? (
          <ProductGrid products={products} priorityCount={4} modo="oferta" />
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
