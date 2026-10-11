import Image from 'next/image'
import { blurProps, coverUrl } from '@/lib/images'
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
 * NO SON ENLACES, A PEDIDO
 * Antes cada foto llevaba a su ficha. Se sacó: en el hero conviven con el
 * botón principal, y dos destinos distintos en el mismo bloque hacen dudar
 * cuál es el camino. Acá las piezas MUESTRAN, y el botón LLEVA.
 *
 * Al no ser interactivas tampoco van en el orden de tabulación ni las anuncia
 * un lector de pantalla: son decorativas y así están marcadas.
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
          <div
            key={pieza.id}
            aria-hidden="true"
            style={
              {
                '--giro': puesto.giro,
                '--demora': puesto.demora,
              } as React.CSSProperties
            }
            className={`at-adelanto absolute ${puesto.caja} block aspect-[4/5] overflow-hidden rounded-xl shadow-card ring-1 ring-white/50`}
          >
            <Image
              src={foto}
              alt=""
              fill
              sizes="(max-width: 768px) 40vw, 240px"
              {...blurProps(pieza.cover_blur)}
              className="object-cover"
            />
          </div>
        )
      })}
    </div>
  )
}
