'use client'

import Link from 'next/link'
import * as React from 'react'
import { CalendarDays, ChevronRight } from 'lucide-react'
import { BuyBox } from '@/components/tienda/buy-box'
import { ProductGallery } from '@/components/tienda/product-gallery'
import { Badge, StarRating } from '@/components/ui/primitives'
import { trackEvent } from '@/lib/analytics/track'
import type { Entrega } from '@/lib/fecha-de-entrega'
import { isNew } from '@/lib/utils'
import type {
  CatalogProduct,
  ProductAttribute,
  ProductAttributeValue,
  ProductMedia,
  VariantView,
} from '@/types/database'

/**
 * Parte interactiva de la ficha.
 *
 * Existe como componente cliente único para que la galería y el selector de
 * variantes compartan una sola pieza de estado: el valor elegido. Así, al
 * tocar "Verde", las fotos verdes pasan al frente.
 */
export function ProductView({
  product,
  variants,
  attributes,
  entrega,
  combinations,
  media,
  whatsappNumber,
}: {
  product: CatalogProduct
  variants: VariantView[]
  attributes: Array<ProductAttribute & { values: ProductAttributeValue[] }>
  /** Para cuando estaria si se encarga hoy. Null si no es a pedido. */
  entrega: Entrega | null
  combinations: Record<string, Record<string, string>>
  media: ProductMedia[]
  whatsappNumber: string | null
}) {
  const [highlightValueId, setHighlightValueId] = React.useState<string | null>(null)

  // Una visita por sesión y por día: el índice único de la base se encarga
  // de que apretar F5 no infle las estadisticas (punto 174).
  React.useEffect(() => {
    void trackEvent('product_view', {
      productId: product.id,
      categoryId: product.category_id,
    })
  }, [product.id, product.category_id])

  return (
    <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <ProductGallery
          media={media}
          productName={product.name}
          productId={product.id}
          highlightValueId={highlightValueId}
        />
      </div>

      <div className="space-y-6">
        <div className="space-y-3">
          {/* Migas: orientan y ayudan al buscador a entender la estructura */}
          {product.category_name && product.category_slug && (
            <nav aria-label="Ruta" className="flex items-center gap-1 text-sm">
              <Link href="/tienda" className="text-ink-subtle hover:text-clay-700">
                Tienda
              </Link>
              <ChevronRight className="size-3.5 text-linen-300" aria-hidden="true" />
              <Link
                href={`/categoria/${product.category_slug}`}
                className="text-ink-subtle hover:text-clay-700"
              >
                {product.category_name}
              </Link>
            </nav>
          )}

          <div className="flex flex-wrap gap-2">
            {product.availability_mode === 'unique_piece' && (
              <Badge tone="primary">Pieza única</Badge>
            )}
            {product.availability_mode === 'made_to_order' && (
              <Badge tone="warning">Se hace por encargo</Badge>
            )}
            {isNew(product.published_at) && <Badge tone="wood">Nuevo</Badge>}
            {(product.discount_percent ?? 0) > 0 && (
              <Badge tone="sale">{product.discount_percent}% OFF</Badge>
            )}
          </div>

          {/* La fecha, no el plazo.
              "~15 dias" obliga a abrir el calendario y contar. Esto responde
              la pregunta que la persona se esta haciendo de verdad, que es si
              llega para el cumpleanios. */}
          {entrega && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-surface-muted px-3 py-2.5 text-sm text-ink-muted">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-clay-500" />
              <span>
                Si lo encargás hoy, lo tenés{' '}
                <strong className="font-medium text-ink">{entrega.texto}</strong>.{' '}
                <span className="text-ink-subtle">
                  Son {entrega.dias} días de taller, sin contar domingos.
                </span>
              </span>
            </p>
          )}

          <h1 className="text-display-md">{product.name}</h1>

          {product.rating_count > 0 && (
            <a href="#resenas" className="inline-block">
              <StarRating value={product.rating_avg} count={product.rating_count} />
            </a>
          )}

          {product.short_description && (
            <p className="text-[1.0625rem] leading-relaxed text-ink-muted">
              {product.short_description}
            </p>
          )}
        </div>

        <BuyBox
          product={product}
          variants={variants}
          attributes={attributes}
          combinations={combinations}
          media={media}
          whatsappNumber={whatsappNumber}
          onSelectionChange={setHighlightValueId}
        />
      </div>
    </div>
  )
}
