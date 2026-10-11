import Image from 'next/image'
import { BrandWatermark } from '@/components/tienda/brand-mark'
import { blurProps, IMAGE_SIZES, storageUrl } from '@/lib/images'
import { cn } from '@/lib/utils'
import type { ProductThumb } from '@/types/database'

/**
 * Un mosaico con las piezas de la categoría.
 *
 * POR QUÉ EXISTE
 * El bloque "Por dónde empezar" mostraba la foto de la categoría. Ninguna
 * categoría tiene foto cargada, así que eran cuadrados en blanco con un nombre
 * debajo: no parecía un diseño minimalista, parecía la página a medio cargar.
 *
 * Ahora se arma con las piezas que ya están cargadas. Se llena solo y, de paso,
 * muestra mercadería de verdad en lugar de una foto de ambiente: el que mira
 * "Espejos" ve tres espejos, no un espejo genérico.
 *
 * LA COMPOSICIÓN CAMBIA SEGÚN CUÁNTAS HAYA
 * Con cuatro, una cuadrícula de dos por dos. Con tres, una grande a la
 * izquierda y dos apiladas. Con dos, mitad y mitad. Con una, ocupa todo.
 *
 * Hacer siempre la cuadrícula de dos por dos y dejar los huecos vacíos sería
 * volver al problema original en chiquito: un hueco vacío al lado de una foto
 * se lee como una foto que no cargó.
 */
export function MosaicoDeCategoria({
  fotos,
  imagenPropia,
  nombre,
}: {
  fotos: ProductThumb[]
  /** Si la categoría tiene su propia foto cargada, esa manda. */
  imagenPropia?: string | null
  nombre: string
}) {
  const propia = storageUrl(imagenPropia)

  if (propia) {
    return (
      <Image
        src={propia}
        alt=""
        fill
        sizes={IMAGE_SIZES.category}
        className="object-cover transition-transform duration-[var(--at-dur-base)] ease-[var(--ease-out-alma)] group-hover:scale-[1.04] motion-reduce:group-hover:scale-100"
      />
    )
  }

  const usables = fotos
    .map((f) => ({ src: storageUrl(f.thumb ?? f.path), blur: f.blur }))
    .filter((f): f is { src: string; blur: string | null } => Boolean(f.src))
    .slice(0, 4)

  // Sin ninguna pieza cargada, un hueco DECLARADO.
  //
  // Antes caía en la textura tejida sola, que está al 1 % de opacidad: en
  // pantalla es un cuadrado crema y se lee igual que una foto que no cargó,
  // que es el problema que había que resolver. Ahora el sello y la palabra
  // dicen qué pasa: esa categoría todavía no tiene piezas.
  if (usables.length === 0) {
    return (
      <div className="at-weave relative grid h-full w-full place-items-center bg-linen-100">
        <div className="flex flex-col items-center gap-1.5 text-linen-400">
          <BrandWatermark className="size-12" />
          <span className="text-[0.6875rem] uppercase tracking-[0.12em]">En el telar</span>
        </div>
      </div>
    )
  }

  const foto = (f: { src: string; blur: string | null }, i: number, clase?: string) => (
    <div key={f.src + i} className={cn('relative overflow-hidden', clase)}>
      <Image
        src={f.src}
        alt=""
        fill
        sizes="(max-width: 768px) 25vw, 160px"
        {...blurProps(f.blur)}
        className="object-cover"
      />
    </div>
  )

  return (
    <div
      // El acercamiento se aplica al mosaico entero y no a cada foto: así se
      // mueve como una sola pieza y no como cuatro cosas sueltas.
      className="h-full w-full transition-transform duration-[var(--at-dur-base)] ease-[var(--ease-out-alma)] group-hover:scale-[1.04] motion-reduce:group-hover:scale-100"
      role="img"
      aria-label={`Algunas piezas de ${nombre}`}
    >
      {usables.length === 1 && foto(usables[0]!, 0, 'h-full w-full')}

      {usables.length === 2 && (
        <div className="grid h-full w-full grid-cols-2 gap-px">
          {usables.map((f, i) => foto(f, i))}
        </div>
      )}

      {usables.length === 3 && (
        <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-px">
          {foto(usables[0]!, 0, 'row-span-2')}
          {foto(usables[1]!, 1)}
          {foto(usables[2]!, 2)}
        </div>
      )}

      {usables.length === 4 && (
        <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-px">
          {usables.map((f, i) => foto(f, i))}
        </div>
      )}
    </div>
  )
}
