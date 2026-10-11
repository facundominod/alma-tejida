'use client'

import useEmblaCarousel from 'embla-carousel-react'
import Image from 'next/image'
import * as React from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { imageAlt, storageUrl } from '@/lib/images'
import { useVentanaVisible } from '@/lib/ui/use-ventana-visible'
import { cn } from '@/lib/utils'
import type { ProductMedia } from '@/types/database'

/**
 * La foto a pantalla completa.
 *
 * Reemplaza al visor anterior, que mostraba UNA sola foto dentro de una caja
 * de 896px con tope de alto: en un celular eso dejaba la imagen flotando en
 * el medio con bandas negras, y no había forma de pasar a la siguiente sin
 * cerrar, volver, y abrir otra.
 *
 * Lo que hace ahora:
 *
 * - **Ocupa la pantalla entera**, la del dispositivo que sea. Nada de anchos
 *   máximos: si la pantalla es un celular angosto, la foto usa ese ancho; si
 *   es un monitor, usa ese.
 * - **Se pasa de una foto a otra** arrastrando o con las flechas, sin salir.
 *   Mirar las fotos de una pieza es justamente comparar una con otra.
 * - **El fondo no scrollea.** Se bloquea el documento mientras está abierto,
 *   y al cerrar se devuelve el scroll donde estaba —no al principio, que es
 *   lo que pasa si uno se olvida de guardar la posición—.
 * - **Se cierra** con la X, con Escape, o tocando fuera de la foto.
 *
 * La marca de agua no se dibuja acá: ya viene impresa en el archivo, así que
 * también está en la foto ampliada y en cualquier copia que alguien se lleve.
 */
export function VisorPantallaCompleta({
  media,
  productName,
  inicial,
  onClose,
}: {
  media: ProductMedia[]
  productName: string
  inicial: number
  onClose: () => void
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    startIndex: inicial,
    loop: media.length > 1,
    align: 'center',
    duration: 20,
  })
  const [actual, setActual] = React.useState(inicial)
  const cajaVisible = useVentanaVisible()

  React.useEffect(() => {
    if (!emblaApi) return
    const alCambiar = () => setActual(emblaApi.selectedScrollSnap())
    emblaApi.on('select', alCambiar)
    return () => {
      emblaApi.off('select', alCambiar)
    }
  }, [emblaApi])

  // Teclado y bloqueo del fondo.
  React.useEffect(() => {
    function alTeclear(evento: KeyboardEvent) {
      if (evento.key === 'Escape') onClose()
      if (evento.key === 'ArrowRight') emblaApi?.scrollNext()
      if (evento.key === 'ArrowLeft') emblaApi?.scrollPrev()
    }

    // Se guarda la posición ANTES de bloquear. `position: fixed` en el body
    // lo lleva al tope; sin esto, al cerrar la persona aparece arriba de
    // todo en lugar de donde estaba mirando.
    const scrollY = window.scrollY
    const estilo = document.body.style.cssText

    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.overflow = 'hidden'

    window.addEventListener('keydown', alTeclear)

    return () => {
      window.removeEventListener('keydown', alTeclear)
      document.body.style.cssText = estilo
      window.scrollTo(0, scrollY)
    }
  }, [emblaApi, onClose])

  return (
    <div
      // `inset-0` mas el alto real de la ventana: en un celular, 100vh es mas
      // alto que la pantalla mientras se ve la barra de direcciones.
      className="at-visor fixed inset-0 z-[60] bg-linen-900"
      style={cajaVisible ?? undefined}
      role="dialog"
      aria-modal="true"
      aria-label={`${productName}, fotos a pantalla completa`}
    >
      {/* El carrusel ocupa todo; cada foto se centra y entra completa. */}
      <div ref={emblaRef} className="h-full overflow-hidden">
        <div className="flex h-full">
          {media.map((foto, i) => (
            <div
              key={foto.id}
              className="relative h-full min-w-0 flex-[0_0_100%]"
              // Tocar el fondo cierra; tocar la foto, no. Si cerrara con
              // cualquier toque, arrastrar para pasar de foto cerraria el
              // visor a mitad de camino.
              onClick={(evento) => {
                if (evento.target === evento.currentTarget) onClose()
              }}
            >
              <Image
                src={storageUrl(foto.storage_path)!}
                alt={imageAlt(foto.alt, productName, i)}
                fill
                sizes="100vw"
                priority={i === inicial}
                className="pointer-events-none object-contain p-3"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Cerrar: arriba a la derecha y siempre encima de todo. */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 z-10 grid size-12 place-items-center rounded-full bg-white/12 text-white backdrop-blur-sm transition-colors hover:bg-white/25"
        aria-label="Cerrar"
      >
        <X className="size-6" />
      </button>

      {media.length > 1 && (
        <>
          {/* Flechas: en pantallas sin dedos, arrastrar no es evidente. */}
          <button
            type="button"
            onClick={() => emblaApi?.scrollPrev()}
            className="absolute left-2 top-1/2 z-10 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-white/12 text-white transition-colors hover:bg-white/25 md:grid"
            aria-label="Foto anterior"
          >
            <ChevronLeft className="size-6" />
          </button>
          <button
            type="button"
            onClick={() => emblaApi?.scrollNext()}
            className="absolute right-2 top-1/2 z-10 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-white/12 text-white transition-colors hover:bg-white/25 md:grid"
            aria-label="Foto siguiente"
          >
            <ChevronRight className="size-6" />
          </button>

          {/* Cuantas hay y cual es: sin esto no se sabe si quedan mas. */}
          <div className="absolute inset-x-0 bottom-4 z-10 flex flex-col items-center gap-2.5">
            <div className="flex gap-1.5">
              {media.map((foto, i) => (
                <button
                  key={foto.id}
                  type="button"
                  onClick={() => emblaApi?.scrollTo(i)}
                  className={cn(
                    'size-2 rounded-full transition-colors',
                    i === actual ? 'bg-white' : 'bg-white/35',
                  )}
                  aria-label={`Ver foto ${i + 1}`}
                  aria-current={i === actual}
                />
              ))}
            </div>
            <span className="tabular rounded-full bg-black/35 px-2.5 py-1 text-xs text-white/90">
              {actual + 1} de {media.length}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
