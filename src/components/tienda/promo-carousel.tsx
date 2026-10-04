'use client'

import Autoplay from 'embla-carousel-autoplay'
import useEmblaCarousel from 'embla-carousel-react'
import Image from 'next/image'
import Link from 'next/link'
import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Overline } from '@/components/ui/primitives'
import { storageUrl } from '@/lib/images'
import { cn } from '@/lib/utils'
import type { Promotion } from '@/types/database'

/**
 * Carrusel de promociones (puntos 24-26).
 *
 * Cero banners hardcodeados: sale de la tabla `promotions`, que el
 * administrador maneja desde el panel.
 *
 * Avanza solo cada 6 segundos, pero se detiene al pasar el mouse, al enfocar
 * con teclado y al tocar. Con `prefers-reduced-motion` no avanza nunca: quedan
 * solo los controles manuales.
 */
export function PromoCarousel({ promotions }: { promotions: Promotion[] }) {
  // El plugin se crea una sola vez, en el inicializador perezoso del estado.
  // No en un ref mutado durante el render: eso rompe el renderizado
  // concurrente de React.
  const [autoplay] = React.useState(() =>
    Autoplay({ delay: 6000, stopOnInteraction: true, stopOnMouseEnter: true }),
  )

  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: promotions.length > 1, align: 'start', duration: 26 },
    promotions.length > 1 ? [autoplay] : [],
  )

  const [selected, setSelected] = React.useState(0)

  // prefers-reduced-motion se consulta en un efecto y no durante el render:
  // matchMedia es una API del navegador y en el servidor no existe. Si la
  // persona pidio menos movimiento, el carrusel deja de avanzar solo y quedan
  // únicamente los controles manuales.
  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')

    const apply = () => {
      if (query.matches) autoplay.stop()
    }

    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [autoplay])

  React.useEffect(() => {
    if (!emblaApi) return
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap())
    onSelect()
    emblaApi.on('select', onSelect)
    return () => {
      emblaApi.off('select', onSelect)
    }
  }, [emblaApi])

  if (promotions.length === 0) return null

  const single = promotions.length === 1

  return (
    <section
      aria-label="Promociones"
      aria-roledescription="carrusel"
      className="at-container"
      // Navegar con teclado detiene el avance automático: si no, el foco
      // salta a una diapositiva que ya no esta.
      onFocusCapture={() => autoplay.stop()}
    >
      <div className="relative">
        <div ref={emblaRef} className="overflow-hidden rounded-xl">
          <div className="flex">
            {promotions.map((promo, index) => (
              <PromoSlide
                key={promo.id}
                promo={promo}
                index={index}
                total={promotions.length}
              />
            ))}
          </div>
        </div>

        {!single && (
          <>
            <CarouselButton
              direction="prev"
              onClick={() => emblaApi?.scrollPrev()}
              className="left-2 md:left-3"
            />
            <CarouselButton
              direction="next"
              onClick={() => emblaApi?.scrollNext()}
              className="right-2 md:right-3"
            />

            <div className="mt-3 flex justify-center gap-1.5">
              {promotions.map((promo, index) => (
                <button
                  key={promo.id}
                  type="button"
                  onClick={() => emblaApi?.scrollTo(index)}
                  aria-label={`Ir a la promoción ${index + 1}: ${promo.title}`}
                  aria-current={selected === index}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-[var(--at-dur-base)]',
                    selected === index
                      ? 'w-6 bg-clay-500'
                      : 'w-1.5 bg-linen-300 hover:bg-linen-400',
                  )}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function PromoSlide({
  promo,
  index,
  total,
}: {
  promo: Promotion
  index: number
  total: number
}) {
  const image = storageUrl(promo.image_path)
  const href = promo.cta_href ?? '/ofertas'

  return (
    <div
      className="min-w-0 flex-[0_0_100%]"
      role="group"
      aria-roledescription="diapositiva"
      aria-label={`${index + 1} de ${total}`}
    >
      <Link
        href={href}
        className="group relative flex min-h-[160px] items-center overflow-hidden rounded-xl bg-clay-100 md:min-h-[220px]"
      >
        {image && (
          <Image
            src={image}
            alt=""
            fill
            sizes="(max-width: 1280px) 100vw, 1280px"
            className="object-cover transition-transform duration-500 ease-[var(--ease-out-alma)] group-hover:scale-[1.02] motion-reduce:group-hover:scale-100"
          />
        )}

        {/* Degradado: garantiza contraste del texto sobre cualquier foto */}
        <div
          className={cn(
            'relative z-10 flex w-full flex-col gap-2 px-6 py-8 md:max-w-lg md:px-10 md:py-12',
            image && 'bg-gradient-to-r from-linen-900/75 via-linen-900/45 to-transparent',
          )}
        >
          <Overline className={image ? 'text-white/75' : 'text-clay-600'}>
            {promo.discount_type === 'percent'
              ? `${Number(promo.discount_value)}% de descuento`
              : 'Promoción'}
          </Overline>
          <p
            className={cn(
              'font-display text-2xl leading-tight md:text-3xl',
              image ? 'text-white' : 'text-clay-800',
            )}
          >
            {promo.title}
          </p>
          {promo.description && (
            <p
              className={cn(
                'max-w-sm text-sm md:text-base',
                image ? 'text-white/85' : 'text-clay-700',
              )}
            >
              {promo.description}
            </p>
          )}
          <span
            className={cn(
              'mt-1 inline-flex w-fit items-center gap-1.5 text-sm font-medium',
              image ? 'text-white' : 'text-clay-700',
            )}
          >
            {promo.cta_label ?? 'Ver piezas'}
            <ChevronRight className="size-4 transition-transform duration-[var(--at-dur-fast)] group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>
    </div>
  )
}

function CarouselButton({
  direction,
  onClick,
  className,
}: {
  direction: 'prev' | 'next'
  onClick: () => void
  className?: string
}) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === 'prev' ? 'Promoción anterior' : 'Promoción siguiente'}
      className={cn(
        'absolute top-1/2 z-20 grid size-10 -translate-y-1/2 place-items-center rounded-full',
        'bg-background/85 text-ink shadow-card backdrop-blur-sm',
        'transition-colors hover:bg-background',
        className,
      )}
    >
      <Icon className="size-5" />
    </button>
  )
}
