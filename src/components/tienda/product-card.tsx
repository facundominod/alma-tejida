'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ImageOff } from 'lucide-react'
import { Badge, Price, StarRating } from '@/components/ui/primitives'
import { blurProps, coverUrl, IMAGE_SIZES } from '@/lib/images'
import { availabilityView } from '@/lib/labels'
import { cn, isNew } from '@/lib/utils'
import type { CatalogProduct } from '@/types/database'

/**
 * Tarjeta del catálogo.
 *
 * Muestra CINCO cosas y ninguna más (punto 31): foto, nombre, precio,
 * disponibilidad e indicador de variantes. El resto vive en la ficha.
 */
export function ProductCard({
  product,
  priority = false,
  sizes = IMAGE_SIZES.card,
  className,
}: {
  product: CatalogProduct
  /** true solo en las primeras imágenes visibles sin scrollear */
  priority?: boolean
  sizes?: string
  className?: string
}) {
  const image = coverUrl(product)
  const availability = availabilityView({
    mode: product.availability_mode,
    display: product.stock_display,
    available: product.available_total,
    threshold: product.low_stock_threshold,
    leadTimeDays: product.lead_time_days,
  })

  const discount = product.discount_percent ?? 0
  const fresh = isNew(product.published_at)

  // "3 colores · 2 medidas" — la única mención a variantes en la tarjeta
  const options = (product.option_summary ?? [])
    .filter((o) => o.count > 1)
    .map((o) => `${o.count} ${o.name.toLowerCase()}${o.count > 1 ? 's' : ''}`)
    .slice(0, 2)
    .join(' · ')

  return (
    <article className={cn('group', className)}>
      <Link href={`/producto/${product.slug}`} className="block focus:outline-none">
        <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-surface-muted">
          {image ? (
            <Image
              src={image}
              alt={product.cover_alt ?? product.name}
              fill
              sizes={sizes}
              priority={priority}
              loading={priority ? undefined : 'lazy'}
              {...blurProps(product.cover_blur)}
              className={cn(
                'object-cover',
                'transition-transform duration-[var(--at-dur-fast)] ease-[var(--ease-out-alma)]',
                'group-hover:scale-[1.04] motion-reduce:group-hover:scale-100',
                !availability.canBuy && 'opacity-75',
              )}
            />
          ) : (
            <div className="grid h-full place-items-center text-linen-300">
              <ImageOff className="size-8" strokeWidth={1.3} />
            </div>
          )}

          {/* Etiquetas: como mucho dos, arriba a la izquierda */}
          <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5">
            {discount > 0 && (
              <Badge tone="sale" size="sm">
                {discount}% OFF
              </Badge>
            )}
            {fresh && discount === 0 && (
              <Badge tone="wood" size="sm">
                Nuevo
              </Badge>
            )}
            {product.availability_mode === 'unique_piece' && (
              <Badge tone="primary" size="sm">
                Pieza única
              </Badge>
            )}
          </div>

          {!availability.canBuy && (
            <div className="absolute inset-x-0 bottom-0 bg-linen-900/72 px-3 py-2 text-center text-xs font-medium text-white backdrop-blur-[2px]">
              {availability.label}
            </div>
          )}
        </div>

        <div className="space-y-1 pt-3">
          {product.category_name && (
            <p className="text-[0.6875rem] uppercase tracking-[0.12em] text-ink-subtle">
              {product.category_name}
            </p>
          )}

          <h3 className="font-display text-[1.0625rem] leading-snug text-linen-900">
            <span className="at-thread-underline">{product.name}</span>
          </h3>

          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 pt-0.5">
            <Price
              final={product.final_price}
              list={discount > 0 ? product.list_price : null}
              from={product.has_price_range}
              size="sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-xs">
            {availability.canBuy && (
              <span
                className={cn(
                  availability.tone === 'warning' && 'font-medium text-warning',
                  availability.tone === 'success' && 'text-ink-subtle',
                  availability.tone === 'neutral' && 'text-ink-subtle',
                )}
              >
                {availability.label}
              </span>
            )}
            {options && <span className="text-ink-subtle">{options}</span>}
          </div>

          {product.rating_count > 0 && (
            <StarRating
              value={product.rating_avg}
              count={product.rating_count}
              size={12}
              className="pt-0.5"
            />
          )}
        </div>
      </Link>
    </article>
  )
}

/**
 * Grilla con entrada escalonada.
 *
 * El stagger tiene TOPE DE 6: la septima tarjeta aparece junto con la sexta.
 * Con 40 productos nadie espera 40 x 35 ms = 1,4 segundos (punto 21).
 */
export function ProductGrid({
  products,
  priorityCount = 4,
  className,
}: {
  products: CatalogProduct[]
  priorityCount?: number
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-x-6 lg:grid-cols-4',
        className,
      )}
    >
      {products.map((product, index) => (
        <div
          key={product.id}
          // El escalonado es `animation-delay`, sin JavaScript ni observador.
          // Tope de 6: la séptima tarjeta entra junto con la sexta, así que
          // con 40 productos nadie espera 40 x 35 ms.
          className="at-rise"
          style={{ animationDelay: `${Math.min(index, 5) * 35}ms` }}
        >
          <ProductCard product={product} priority={index < priorityCount} />
        </div>
      ))}
    </div>
  )
}
