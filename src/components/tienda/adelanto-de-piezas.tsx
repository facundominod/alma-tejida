import Image from 'next/image'
import Link from 'next/link'
import { blurProps, coverUrl } from '@/lib/images'
import { formatPrice } from '@/lib/utils'
import { PISO_PARA_REDONDEAR } from '@/lib/redondeo'
import type { CatalogProduct } from '@/types/database'

/**
 * Tres piezas de verdad, adelantadas en la portada.
 *
 * QUÉ REEMPLAZA
 * Media portada era un rectángulo de color con una textura al 1 % de opacidad.
 * En una tienda, el lugar más caro de la pantalla no puede estar vacío: ahí va
 * lo que se vende.
 *
 * POR QUÉ APILADAS Y GIRADAS
 * Tres fotos alineadas en una grilla se leen como un catálogo chico, y el
 * catálogo ya está más abajo. Apiladas y con un giro mínimo se leen como piezas
 * apoyadas sobre una mesa, que es de dónde vienen.
 *
 * SON ENLACES
 * Cada una lleva a su ficha. Un adelanto que no se puede tocar es una foto de
 * stock con pasos de más.
 */
export function AdelantoDePiezas({ piezas }: { piezas: CatalogProduct[] }) {
  // Las tres primeras con foto. Sin foto no hay nada que adelantar.
  const conFoto = piezas.filter((p) => coverUrl(p)).slice(0, 3)

  if (conFoto.length === 0) {
    return <div className="at-weave absolute inset-0 bg-clay-200/45" />
  }

  // Posición, giro y demora de cada una. Fijos y no calculados: son tres, y
  // una fórmula para tres casos es más difícil de leer que los tres casos.
  const puestos = [
    { caja: 'left-[6%] top-[14%] w-[46%]', giro: '-5deg', demora: '120ms' },
    { caja: 'right-[8%] top-[26%] w-[42%]', giro: '4deg', demora: '320ms' },
    { caja: 'left-[22%] bottom-[10%] w-[44%]', giro: '-2deg', demora: '520ms' },
  ]

  return (
    <div className="absolute inset-0">
      {conFoto.map((pieza, i) => {
        const puesto = puestos[i]!
        const foto = coverUrl(pieza)!

        return (
          <Link
            key={pieza.id}
            href={`/producto/${pieza.slug}`}
            style={
              {
                '--giro': puesto.giro,
                '--demora': puesto.demora,
              } as React.CSSProperties
            }
            className={`at-adelanto group absolute ${puesto.caja} block aspect-[4/5] overflow-hidden rounded-xl shadow-card ring-1 ring-white/50 transition-shadow duration-[var(--at-dur-base)] hover:shadow-lg`}
          >
            <Image
              src={foto}
              alt={pieza.cover_alt ?? pieza.name}
              fill
              sizes="(max-width: 768px) 40vw, 240px"
              {...blurProps(pieza.cover_blur)}
              className="object-cover"
            />

            {/* El precio sólo en la de adelante: tres precios encimados en un
                adelanto es una lista de precios, no un adelanto.

                Y sólo si es un precio de verdad. Varias piezas están cargadas
                en $1 mientras se definen los precios, y "desde $1" en la
                portada es peor que no decir nada: deja a la tienda pareciendo
                rota en la primera pantalla. Se usa el mismo piso que protege
                al redondeo masivo, por la misma razón. */}
            {i === conFoto.length - 1 &&
              pieza.final_price != null &&
              Number(pieza.final_price) >= PISO_PARA_REDONDEAR && (
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-linen-900/80 to-transparent px-3 pb-2 pt-6 text-xs font-medium text-white">
                <span className="block truncate">{pieza.name}</span>
                <span className="tabular opacity-90">
                  desde {formatPrice(pieza.final_price)}
                </span>
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
