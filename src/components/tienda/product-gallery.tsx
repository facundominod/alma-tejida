'use client'

import useEmblaCarousel from 'embla-carousel-react'
import Image from 'next/image'
import * as React from 'react'
import { ChevronLeft, ChevronRight, Expand, ImageOff, Play } from 'lucide-react'
import { blurProps, IMAGE_SIZES, imageAlt, storageUrl } from '@/lib/images'
import { VisorPantallaCompleta } from '@/components/tienda/visor-pantalla-completa'
import { trackEvent } from '@/lib/analytics/track'
import { cn } from '@/lib/utils'
import type { ProductMedia } from '@/types/database'

/**
 * Galería de producto.
 *
 * Móvil: swipe con arrastre real y momentum, pantalla completa al tocar.
 * Desktop: miniaturas verticales + imagen grande con zoom al pasar el mouse.
 *
 * El video usa `preload="none"` y poster estático: no descarga un solo byte
 * hasta que alguien toca play. Es lo que hace viable tener video con el plan
 * gratuito (ver docs/03-STORAGE.md).
 */
export function ProductGallery({
  media,
  productName,
  productId,
  /** Cuando se elige "Verde", las fotos verdes pasan primero */
  highlightValueId,
}: {
  media: ProductMedia[]
  productName: string
  productId: string
  highlightValueId?: string | null
}) {
  // Las fotos asociadas al valor elegido van adelante, sin sacar las demas:
  // así la persona ve primero su color pero puede seguir mirando el resto.
  const ordered = React.useMemo(() => {
    if (!highlightValueId) return media
    const matching = media.filter((m) => m.attribute_value_id === highlightValueId)
    if (matching.length === 0) return media
    return [...matching, ...media.filter((m) => m.attribute_value_id !== highlightValueId)]
  }, [media, highlightValueId])

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: ordered.length > 1,
    align: 'start',
    duration: 22,
  })
  const [selected, setSelected] = React.useState(0)
  const [zoomed, setZoomed] = React.useState(false)
  const [origin, setOrigin] = React.useState('50% 50%')
  const [lightbox, setLightbox] = React.useState(false)
  const viewedRef = React.useRef(new Set<string>())

  React.useEffect(() => {
    if (!emblaApi) return
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap())
    onSelect()
    emblaApi.on('select', onSelect)
    return () => {
      emblaApi.off('select', onSelect)
    }
  }, [emblaApi])

  // Se registra la vista de una imagen cuando REALMENTE se vio: la imagen
  // activa, sostenida 800 ms. No en cada render (punto 95).
  React.useEffect(() => {
    const current = ordered[selected]
    if (!current || viewedRef.current.has(current.id)) return

    const timer = window.setTimeout(() => {
      viewedRef.current.add(current.id)
      void trackEvent('gallery_image_view', {
        productId,
        mediaId: current.id,
      })
    }, 800)

    return () => window.clearTimeout(timer)
  }, [selected, ordered, productId])

  const goTo = React.useCallback(
    (index: number) => {
      emblaApi?.scrollTo(index)
      setSelected(index)
    },
    [emblaApi],
  )

  if (ordered.length === 0) {
    return (
      <div className="grid aspect-square place-items-center rounded-xl bg-surface-muted text-linen-300">
        <ImageOff className="size-10" strokeWidth={1.2} />
      </div>
    )
  }

  const active = ordered[selected]

  // El visor muestra solo fotos: un video a pantalla completa necesita
  // controles propios y no es lo que se pidio.
  const imagenes = ordered.filter((m) => m.type === 'image')

  function onZoomMove(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 100
    const y = ((event.clientY - rect.top) / rect.height) * 100
    setOrigin(`${x}% ${y}%`)
  }

  return (
    <>
      <div className="flex flex-col-reverse gap-3 md:flex-row md:gap-4">
        {/* Miniaturas: verticales en desktop, horizontales en móvil */}
        {ordered.length > 1 && (
          <div
            className="scrollbar-none flex gap-2 overflow-x-auto md:w-[88px] md:shrink-0 md:flex-col md:overflow-y-auto"
            role="tablist"
            aria-label="Imágenes del producto"
          >
            {ordered.map((item, index) => {
              const thumb = storageUrl(item.thumb_path ?? item.storage_path)
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selected === index}
                  aria-label={`Ver imagen ${index + 1} de ${ordered.length}`}
                  onClick={() => goTo(index)}
                  className={cn(
                    'relative aspect-square w-[68px] shrink-0 overflow-hidden rounded-md border-2 transition-colors md:w-full',
                    selected === index
                      ? 'border-clay-400'
                      : 'border-transparent hover:border-border-strong',
                  )}
                >
                  {thumb && (
                    <Image
                      src={thumb}
                      alt=""
                      fill
                      sizes={IMAGE_SIZES.thumb}
                      className="object-cover"
                    />
                  )}
                  {item.type === 'video' && (
                    <span className="absolute inset-0 grid place-items-center bg-linen-900/35 text-white">
                      <Play className="size-4 fill-current" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Imagen grande */}
        <div className="relative min-w-0 flex-1">
          <div ref={emblaRef} className="overflow-hidden rounded-xl">
            <div className="flex">
              {ordered.map((item, index) => (
                <div key={item.id} className="min-w-0 flex-[0_0_100%]">
                  <div
                    className="relative aspect-[4/5] overflow-hidden bg-surface-muted"
                    onMouseEnter={() => item.type === 'image' && setZoomed(true)}
                    onMouseLeave={() => setZoomed(false)}
                    onMouseMove={onZoomMove}
                  >
                    {item.type === 'video' ? (
                      <VideoPlayer
                        media={item}
                        productId={productId}
                        poster={storageUrl(item.thumb_path)}
                      />
                    ) : (
                      <Image
                        src={storageUrl(item.storage_path)!}
                        alt={imageAlt(item.alt, productName, index)}
                        fill
                        sizes={IMAGE_SIZES.gallery}
                        priority={index === 0}
                        {...blurProps(item.blur_data)}
                        className={cn(
                          'object-cover transition-transform duration-300 ease-[var(--ease-out-alma)]',
                          'motion-reduce:transition-none',
                        )}
                        style={
                          zoomed && selected === index
                            ? { transform: 'scale(1.75)', transformOrigin: origin }
                            : undefined
                        }
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pantalla completa */}
          {active?.type === 'image' && (
            <button
              type="button"
              onClick={() => setLightbox(true)}
              className="absolute right-3 top-3 grid size-10 place-items-center rounded-full bg-background/85 text-ink shadow-card backdrop-blur-sm transition-colors hover:bg-background"
              aria-label="Ver en pantalla completa"
            >
              <Expand className="size-[18px]" />
            </button>
          )}

          {ordered.length > 1 && (
            <>
              <GalleryArrow
                direction="prev"
                onClick={() => emblaApi?.scrollPrev()}
                className="left-2"
              />
              <GalleryArrow
                direction="next"
                onClick={() => emblaApi?.scrollNext()}
                className="right-2"
              />

              <div className="mt-3 flex justify-center gap-1.5 md:hidden">
                {ordered.map((item, index) => (
                  <span
                    key={item.id}
                    className={cn(
                      'h-1.5 rounded-full transition-all duration-[var(--at-dur-base)]',
                      selected === index ? 'w-5 bg-clay-500' : 'w-1.5 bg-linen-300',
                    )}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Sin AnimatePresence: el visor ocupa la pantalla entera y animar su
          salida solo retrasa el momento en que se vuelve a ver la pagina. */}
      {lightbox && imagenes.length > 0 && (
        <VisorPantallaCompleta
          media={imagenes}
          productName={productName}
          inicial={Math.min(selected, imagenes.length - 1)}
          onClose={() => setLightbox(false)}
        />
      )}
    </>
  )
}

function GalleryArrow({
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
      aria-label={direction === 'prev' ? 'Imagen anterior' : 'Imagen siguiente'}
      className={cn(
        'absolute top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full',
        'bg-background/85 text-ink shadow-card backdrop-blur-sm transition-colors hover:bg-background',
        className,
      )}
    >
      <Icon className="size-5" />
    </button>
  )
}

/**
 * Video con preload="none": el archivo no se descarga hasta que alguien toca
 * play. Es la diferencia entre un video que cuesta 8 MB por visita y uno que
 * cuesta 8 MB por persona que realmente lo quiso ver.
 */
function VideoPlayer({
  media,
  productId,
  poster,
}: {
  media: ProductMedia
  productId: string
  poster: string | null
}) {
  const src = media.external_url ?? storageUrl(media.storage_path)
  if (!src) return null

  return (
    <video
      src={src}
      poster={poster ?? undefined}
      controls
      preload="none"
      playsInline
      className="h-full w-full object-cover"
      onPlay={() => void trackEvent('video_play', { productId, mediaId: media.id })}
    >
      Tu navegador no puede reproducir este video.
    </video>
  )
}

