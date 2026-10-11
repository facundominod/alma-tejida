'use client'

import Autoplay from 'embla-carousel-autoplay'
import useEmblaCarousel from 'embla-carousel-react'
import Image from 'next/image'
import Link from 'next/link'
import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Overline } from '@/components/ui/primitives'
import { storageUrl } from '@/lib/images'
import { CifraDeDescuento } from '@/components/tienda/cifra-de-descuento'
import { CuentaRegresiva } from '@/components/tienda/cuenta-regresiva'
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

  // El brillo se reserva para las promociones con fecha de corte. Si lo
  // llevaran todas, dejaria de significar "esto se termina".
  const fugaz = promo.ends_at != null

  // Dos tonos alternados: tres promociones sin foto seguidas, todas del mismo
  // color, se leen como una sola repetida.
  const kraft = index % 2 === 0

  return (
    <div
      className="min-w-0 flex-[0_0_100%]"
      role="group"
      aria-roledescription="diapositiva"
      aria-label={`${index + 1} de ${total}`}
    >
      <Link
        href={href}
        className={cn(
          'group relative block overflow-hidden rounded-xl',
          image ? 'bg-clay-100' : kraft ? 'bg-clay-100' : 'bg-sage-100',
          fugaz && !image && 'at-cinta-fugaz',
        )}
      >
        {image && (
          <>
            <Image
              src={image}
              alt=""
              fill
              sizes="(max-width: 1280px) 100vw, 1280px"
              className="object-cover transition-transform duration-500 ease-[var(--ease-out-alma)] group-hover:scale-[1.02] motion-reduce:group-hover:scale-100"
            />
            {/* Degradado: garantiza contraste del texto sobre cualquier foto */}
            <div className="absolute inset-0 bg-gradient-to-r from-linen-900/80 via-linen-900/45 to-transparent" />
          </>
        )}

        {/* Sin foto, la textura en capas. Nunca un color plano: es lo que
            hacia que una promocion sin foto pareciera un aviso a medio cargar. */}
        {!image && (
          <>
            <div
              className={cn(
                'absolute inset-0',
                kraft
                  ? 'bg-[radial-gradient(120%_90%_at_15%_0%,var(--color-clay-100),var(--color-clay-200)_55%,var(--color-clay-300))]'
                  : 'bg-[radial-gradient(120%_90%_at_15%_0%,var(--color-sage-100),var(--color-linen-200)_55%,var(--color-linen-300))]',
              )}
            />
            <div className="at-weave absolute inset-0 opacity-70" />
          </>
        )}

        {/* La reja: texto a la izquierda, cifra a la derecha. En celular la
            cifra va primero, porque es el gancho. */}
        <div className="relative z-10 grid min-h-[230px] gap-4 px-6 py-8 md:min-h-[280px] md:grid-cols-[1.1fr_0.9fr] md:items-center md:gap-8 md:px-10 md:py-12">
          <div className="order-last flex flex-col gap-2 md:order-first">
            <div className="flex flex-wrap items-center gap-2">
              {/* El overline ya no repite el descuento: eso lo grita la cifra.
                  Acá va la vigencia, que es el dato que falta. */}
              <Overline className={image ? 'text-white/75' : 'text-clay-600'}>
                {promo.ends_at ? 'Por tiempo limitado' : 'Oferta vigente'}
              </Overline>
              <CuentaRegresiva
                termina={promo.ends_at}
                className={image ? 'bg-white/20 text-white' : undefined}
              />
            </div>

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

          {/* La cifra. Con foto va mas chica y sobria: ahi la foto es la que
              tiene que mirarse, y dos protagonistas no son ninguno. */}
          <div
            className={cn(
              'order-first md:order-last',
              image ? 'hidden md:grid md:justify-end' : '',
            )}
          >
            <CifraDeDescuento
              promo={promo}
              className={image ? 'text-white/90' : kraft ? 'text-clay-700' : 'text-sage-600'}
            />
          </div>
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
