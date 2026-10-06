'use client'

import Image from 'next/image'
import type * as React from 'react'
import Link from 'next/link'
import { ImageOff } from 'lucide-react'
import { Badge, Price, StarRating } from '@/components/ui/primitives'
import { blurProps, IMAGE_SIZES, storageUrl } from '@/lib/images'
import { availabilityView } from '@/lib/labels'
import { useRotacion } from '@/lib/ui/use-rotacion'
import { cn, isNew } from '@/lib/utils'
import type { CatalogProduct, ProductThumb } from '@/types/database'

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
  /** Desfase del giro de fotos, para que la grilla no cambie toda junta. */
  turno = 0,
  className,
}: {
  product: CatalogProduct
  /** true solo en las primeras imágenes visibles sin scrollear */
  priority?: boolean
  sizes?: string
  turno?: number
  className?: string
}) {
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
        <GaleriaDeTarjeta
          product={product}
          sizes={sizes}
          priority={priority}
          turno={turno}
          apagada={!availability.canBuy}
        >

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
        </GaleriaDeTarjeta>

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
          <ProductCard
            product={product}
            priority={index < priorityCount}
            turno={index}
          />
        </div>
      ))}
    </div>
  )
}

/**
 * La caja de la foto, con las fotos de la pieza turnándose.
 *
 * Cómo se ve: una pieza tejida se mira girándola —el derecho, el revés, el
 * detalle del nudo—. Esto hace eso solo, sin que nadie tenga que entrar a la
 * ficha para enterarse de que hay más de una foto.
 *
 * Cómo está hecho: las imágenes se apilan y se cruzan con opacidad. Nada se
 * mueve de lugar, así que el navegador lo resuelve en el compositor y no
 * recalcula el layout ni una vez.
 *
 * Qué NO hace:
 *   - No gira si la pieza tiene una sola foto.
 *   - No gira fuera de pantalla, ni con la pestaña escondida, ni con
 *     `prefers-reduced-motion` (todo eso vive en `useRotacion`).
 *   - No carga las fotos de atrás con prioridad: la portada es la que importa
 *     para el primer dibujado.
 *
 * Cada tarjeta arranca desfasada 420 ms por su posición, con tope de ocho: sin
 * eso, veinte piezas cambian de foto al unísono y el catálogo parpadea.
 */
function GaleriaDeTarjeta({
  product,
  sizes,
  priority,
  turno,
  apagada,
  children,
}: {
  product: CatalogProduct
  sizes: string
  priority: boolean
  turno: number
  apagada: boolean
  children: React.ReactNode
}) {
  // La portada siempre primero. Si la galería no vino (catálogos viejos, o una
  // pieza con una sola foto), se usa sola.
  const fotos: ProductThumb[] =
    product.gallery && product.gallery.length > 0
      ? product.gallery
      : [
          {
            path: product.cover_path,
            thumb: product.cover_thumb,
            blur: product.cover_blur,
            alt: product.cover_alt,
          },
        ]

  const urls = fotos
    .map((f) => ({ src: storageUrl(f.thumb ?? f.path), blur: f.blur, alt: f.alt }))
    .filter((f): f is { src: string; blur: string | null; alt: string | null } =>
      Boolean(f.src),
    )

  const { indice, ref } = useRotacion(urls.length, {
    intervaloMs: 3600,
    retrasoMs: Math.min(turno, 8) * 420,
  })

  return (
    <div
      ref={ref}
      className="relative aspect-[4/5] overflow-hidden rounded-lg bg-surface-muted"
    >
      {urls.length > 0 ? (
        urls.map((foto, i) => (
          <Image
            key={foto.src}
            src={foto.src}
            // Sólo la foto visible lleva el texto alternativo. Si todas lo
            // llevaran, un lector de pantalla leería la misma pieza tres
            // veces seguidas.
            alt={i === indice ? (foto.alt ?? product.cover_alt ?? product.name) : ''}
            aria-hidden={i !== indice}
            fill
            sizes={sizes}
            priority={priority && i === 0}
            loading={priority && i === 0 ? undefined : 'lazy'}
            {...blurProps(foto.blur)}
            className={cn(
              'object-cover',
              'transition-[opacity,transform] duration-[var(--at-dur-slow)] ease-[var(--ease-out-alma)]',
              'group-hover:scale-[1.04] motion-reduce:group-hover:scale-100',
              i === indice ? 'opacity-100' : 'opacity-0',
              apagada && 'opacity-75',
              apagada && i !== indice && 'opacity-0',
            )}
          />
        ))
      ) : (
        <div className="grid h-full place-items-center text-linen-300">
          <ImageOff className="size-8" strokeWidth={1.3} />
        </div>
      )}

      {/* Marcas de cuántas fotos hay y cuál se está viendo. Sólo con dos o
          más: con una sola sería un punto solitario sin significado. */}
      {urls.length > 1 && (
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
          {urls.map((foto, i) => (
            <span
              key={foto.src}
              className={cn(
                'size-1.5 rounded-full transition-colors duration-[var(--at-dur-base)]',
                i === indice ? 'bg-white' : 'bg-white/45',
              )}
            />
          ))}
        </div>
      )}

      {children}
    </div>
  )
}
