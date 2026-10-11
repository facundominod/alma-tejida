import { cn } from '@/lib/utils'
import type { Promotion } from '@/types/database'

/**
 * El descuento, en grande.
 *
 * POR QUÉ EXISTE
 * Una promoción sin foto cargada quedaba como un rectángulo de color con texto
 * encima: "Día de la Madre" se veía igual de apagado que cualquier aviso. Y
 * conseguir una foto para cada promoción es trabajo que nadie va a hacer a
 * tiempo.
 *
 * Así que cuando no hay foto, el porcentaje ES la pieza gráfica: una cifra
 * enorme en la serif de la casa, con un cordón trazándose detrás. Lo que se
 * mira primero es cuánto se ahorra, que es lo que importa.
 *
 * EL CORDÓN NO ES DECORACIÓN SUELTA
 * Es el oficio dibujado: un hilo que entra, se anuda y sale. Se traza una sola
 * vez al aparecer la diapositiva; después se queda quieto, porque algo que no
 * para de moverse detrás de un número impide leerlo.
 */
export function CifraDeDescuento({
  promo,
  className,
}: {
  promo: Promotion
  className?: string
}) {
  const valor = Number(promo.discount_value)

  const { numero, unidad } =
    promo.discount_type === 'percent'
      ? { numero: String(Math.round(valor)), unidad: '%' }
      : promo.discount_type === 'amount_off'
        ? { numero: `$${Math.round(valor).toLocaleString('es-AR')}`, unidad: '' }
        : { numero: 'Precio', unidad: 'especial' }

  return (
    <div className={cn('relative grid place-items-center', className)}>
      {/* El cordón, detrás. `aria-hidden` porque no dice nada que el número no
          diga ya; para un lector de pantalla sería ruido. */}
      <svg
        viewBox="0 0 200 120"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full text-clay-400/35"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      >
        <path
          className="at-nudo"
          d="M8 92 C 46 92, 54 30, 92 30 C 120 30, 120 70, 92 70 C 64 70, 64 30, 92 30 C 130 30, 138 92, 192 92"
        />
      </svg>

      <p className="at-deriva flex items-baseline gap-1 leading-none motion-reduce:animate-none">
        <span
          className="font-display leading-[0.78] tracking-[-0.03em]"
          style={{ fontSize: 'clamp(3.75rem, 14vw, 7rem)' }}
        >
          {numero}
        </span>
        {unidad && (
          /* Tamaño propio y no `em`: el `em` cuenta desde el PADRE, no desde
             el número que tiene al lado. Con `0.42em` el signo de porcentaje
             salía de 6 px —una mota al lado de una cifra de 112— porque el
             padre tiene el tamaño de texto normal. */
          <span
            className="font-display leading-none opacity-80"
            style={{ fontSize: 'clamp(1.5rem, 5.5vw, 2.8rem)' }}
          >
            {unidad}
          </span>
        )}
      </p>
    </div>
  )
}
